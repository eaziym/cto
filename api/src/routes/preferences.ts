// User Preferences API Routes

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { supabaseAdmin } from '../supabase.js';
import { predictPreferences } from '../ai/preference_predictor.js';
import { getAggregatedKnowledgeBase } from '../knowledge/aggregator.js';
import type { UserPreferences } from '../knowledge/types.js';

const router = express.Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const updatePreferencesSchema = z.object({
  // User-confirmed preferences (arrays)
  confirmed_industries: z.array(z.string()).optional(),
  confirmed_roles: z.array(z.string()).optional(),
  confirmed_companies: z.array(z.string()).optional(),
  
  // Free-form "Other" options
  other_industries: z.string().optional(),
  other_roles: z.string().optional(),
  other_companies: z.string().optional(),
  
  // Additional context
  additional_context: z.string().optional(),
});

// ============================================================================
// GET /api/preferences
// Get current user preferences
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const { data, error } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error) throw error;
    
    res.json({ preferences: data });
  } catch (error) {
    logger.error('Failed to fetch preferences:', error);
    res.status(500).json({
      error: 'Failed to fetch preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// POST /api/preferences/predict
// Use AI to predict user preferences based on knowledge base
// ============================================================================

router.post('/predict', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    logger.info(`Predicting preferences for user ${userId}`);
    
    // Get cached aggregated knowledge base from profiles table
    logger.info('Fetching aggregated knowledge base...');
    const knowledgeBase = await getAggregatedKnowledgeBase(userId);
    
    if (!knowledgeBase) {
      logger.warn(`No profile found for user ${userId}`);
      return res.status(400).json({
        error: 'No profile found',
        message: 'Please add at least one knowledge source before predicting preferences',
      });
    }
    
    logger.info('Knowledge base fetched:', {
      hasName: !!knowledgeBase.name,
      hasSummary: !!knowledgeBase.summary,
      skillsCount: knowledgeBase.skills?.length || 0,
      experienceCount: knowledgeBase.experience?.length || 0,
    });
    
    if (!knowledgeBase.summary && (!knowledgeBase.skills || knowledgeBase.skills.length === 0)) {
      logger.warn(`Insufficient knowledge base for user ${userId}`);
      return res.status(400).json({
        error: 'Insufficient knowledge base',
        message: 'Please add at least one knowledge source before predicting preferences',
      });
    }
    
    // Use AI to predict preferences
    logger.info('Calling predictPreferences...');
    const predictedPreferences = await predictPreferences(knowledgeBase);
    logger.info('Preferences predicted successfully');
    
    // Format predictions with confidence scores for JSONB storage
    const predictedIndustries = predictedPreferences.industries.map(p => ({
      name: p.name,
      confidence: p.confidence,
      reasoning: p.reasoning,
    }));
    const predictedRoles = predictedPreferences.roles.map(p => ({
      name: p.name,
      confidence: p.confidence,
      reasoning: p.reasoning,
    }));
    const predictedCompanies = predictedPreferences.companies.map(p => ({
      name: p.name,
      confidence: p.confidence,
      reasoning: p.reasoning,
    }));
    
    // Check if preferences already exist
    const { data: existingPrefs } = await supabaseAdmin
      .from('user_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    let preferences: UserPreferences;
    
    const predictionMetadata = {
      model: 'gpt-4o-mini',
      timestamp: new Date().toISOString(),
      knowledge_sources_count: knowledgeBase.sources.length,
    };
    
    if (existingPrefs) {
      // Update existing - clear confirmed selections when regenerating predictions
      const { data, error } = await supabaseAdmin
        .from('user_preferences')
        .update({
          predicted_industries: predictedIndustries,
          predicted_roles: predictedRoles,
          predicted_companies: predictedCompanies,
          confirmed_industries: [], // Clear confirmed selections
          confirmed_roles: [], // Clear confirmed selections
          confirmed_companies: [], // Clear confirmed selections
          prediction_metadata: predictionMetadata,
          last_predicted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      preferences = data;
    } else {
      // Create new
      const { data, error } = await supabaseAdmin
        .from('user_preferences')
        .insert({
          user_id: userId,
          predicted_industries: predictedIndustries,
          predicted_roles: predictedRoles,
          predicted_companies: predictedCompanies,
          prediction_metadata: predictionMetadata,
          last_predicted_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      preferences = data;
    }
    
    res.json({
      preferences,
      message: 'Preferences predicted successfully',
    });
  } catch (error) {
    logger.error('Failed to predict preferences:', error);
    
    // Enhanced error logging
    if (error instanceof Error) {
      logger.error('Error name:', error.name);
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
    } else {
      logger.error('Non-Error object:', JSON.stringify(error, null, 2));
    }
    
    // Check for specific error types
    if (error instanceof Error && error.message.includes('Insufficient knowledge base')) {
      return res.status(400).json({
        error: 'Insufficient knowledge base',
        message: error.message,
      });
    }
    
    // Serialize error properly
    let errorMessage = 'Unknown error';
    let errorDetails = {};
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = {
        name: error.name,
        ...(process.env.NODE_ENV !== 'production' && {
          stack: error.stack,
        }),
      };
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
      errorDetails = { raw: error };
    } else {
      errorMessage = String(error);
    }
    
    res.status(500).json({
      error: 'Failed to predict preferences',
      message: errorMessage,
      ...errorDetails,
    });
  }
});

// ============================================================================
// PUT /api/preferences
// Update user preferences (user confirmation/modification)
// ============================================================================

router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = updatePreferencesSchema.parse(req.body);
    
    logger.info(`Updating preferences for user ${userId}`);
    
    // Check if preferences exist
    const { data: existingPrefs } = await supabaseAdmin
      .from('user_preferences')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    let preferences: UserPreferences;
    
    if (existingPrefs) {
      // Update existing
      const { data, error } = await supabaseAdmin
        .from('user_preferences')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      preferences = data;
    } else {
      // Create new
      const { data, error } = await supabaseAdmin
        .from('user_preferences')
        .insert({
          user_id: userId,
          ...body,
        })
        .select()
        .single();
      
      if (error) throw error;
      preferences = data;
    }
    
    res.json({
      preferences,
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error('Failed to update preferences:', error);
    res.status(500).json({
      error: 'Failed to update preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// DELETE /api/preferences
// Reset/delete user preferences
// ============================================================================

router.delete('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const { error } = await supabaseAdmin
      .from('user_preferences')
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
    
    res.json({ message: 'Preferences deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete preferences:', error);
    res.status(500).json({
      error: 'Failed to delete preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
