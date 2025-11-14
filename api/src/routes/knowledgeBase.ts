// Knowledge Base API Routes

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';
import {
  createKnowledgeSource,
  getKnowledgeSources,
  deleteKnowledgeSource,
  createPendingKnowledgeSource,
  markSourceAsProcessing,
  markSourceAsCompleted,
  markSourceAsFailed,
} from '../knowledge/sources.js';
import { scrapeAndParseLinkedIn } from '../knowledge/linkedin.js';
import { scrapeAndParseGitHub, extractGitHubUsername } from '../knowledge/github.js';
import { scrapeAndParseWebsite } from '../knowledge/website.js';
import { analyzeResume } from '../resume/analyzer.js';
import { extract_resume_info, extract_project_info } from '../resume/llm_analyzer.js';
import { supabaseAdmin } from '../supabase.js';
import type { ParsedKnowledgeData } from '../knowledge/types.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// NOTE: Background aggregation has been removed in favor of the streaming
// edge function (aggregate-profile-stream) which is triggered on-demand by
// the frontend. This prevents duplicate aggregations and allows real-time
// streaming updates to the UI.

// ============================================================================
// SCHEMAS
// ============================================================================

const linkedInSchema = z.object({
  // Accept either a full LinkedIn URL or a username/handle. We'll
  // normalize to a full URL server-side to avoid client-side validation
  // mismatches (users may paste "eaziy" or "/in/eaziy" etc.).
  url: z.string().min(1),
});

const githubSchema = z.object({
  url: z.string(), // Can be URL or username
});

const websiteSchema = z.object({
  url: z.string().url(),
});

const manualTextSchema = z.object({
  content: z.string().min(1),
});

// ============================================================================
// GET /api/knowledge-sources
// List all knowledge sources for the authenticated user
// ============================================================================

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const sources = await getKnowledgeSources(userId);
    
    res.json({ sources });
  } catch (error) {
    logger.error('Failed to fetch knowledge sources:', error);
    res.status(500).json({
      error: 'Failed to fetch knowledge sources',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// GET /api/knowledge-sources/aggregate
// Get the aggregated unified profile
// ============================================================================

router.get('/aggregate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // Get cached aggregated profile with timestamp
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('knowledge_base_summary, knowledge_base_updated_at')
      .eq('id', userId)
      .single();
    
    const knowledgeBase = data?.knowledge_base_summary;
    const updatedAt = data?.knowledge_base_updated_at;
    
    logger.info(`[GET AGGREGATE] Retrieved profile for user ${userId}: ${knowledgeBase?.sources?.length || 0} sources, updated at ${updatedAt}`);
    
    // Add the updated_at timestamp to the response if profile exists
    if (knowledgeBase && updatedAt) {
      knowledgeBase.updated_at = updatedAt;
    }
    
    res.json({ aggregated_profile: knowledgeBase });
  } catch (error) {
    logger.error('Failed to get aggregated knowledge base:', error);
    res.status(500).json({
      error: 'Failed to get aggregated profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// PATCH /api/knowledge-sources/aggregate
// Update the aggregated unified profile
// ============================================================================

router.patch('/aggregate', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid update data' });
    }

    logger.info(`[PATCH AGGREGATE] Updating profile for user ${userId}:`, Object.keys(updates));

    // Get current aggregated profile
    const { data, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('knowledge_base_summary')
      .eq('id', userId)
      .single();

    if (fetchError || !data?.knowledge_base_summary) {
      return res.status(404).json({ error: 'No aggregated profile found' });
    }

    // Merge updates with existing profile
    const updatedProfile = {
      ...data.knowledge_base_summary,
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Save updated profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        knowledge_base_summary: updatedProfile,
        knowledge_base_updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    logger.info(`[PATCH AGGREGATE] Successfully updated profile for user ${userId}`);

    res.json({
      aggregated_profile: updatedProfile,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update aggregated profile:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// POST /api/knowledge-sources/upload
// Upload and parse a document (PDF, DOCX)
// ============================================================================

router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logger.info(`[UPLOAD] Processing uploaded resume: ${file.originalname} for user ${userId}`);
    
    // Create pending source first
    const pendingSource = await createPendingKnowledgeSource(userId, 'resume', file.originalname);
    
    // Process async (in background)
    processResumeDocument(pendingSource.id, userId, file).catch((error) => {
      logger.error(`[UPLOAD] Background processing failed for source ${pendingSource.id}:`, error);
    });
    
    res.json({
      source: pendingSource,
      message: 'Resume is being processed',
    });
  } catch (error) {
    logger.error('[UPLOAD] Failed to upload resume:', error);
    res.status(500).json({
      error: 'Failed to process file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processResumeDocument(sourceId: string, userId: string, file: Express.Multer.File): Promise<void> {
  try {
    logger.info(`[UPLOAD] Starting LLM parsing for source ${sourceId}...`);
    await markSourceAsProcessing(sourceId);
    
    const parsedProfile = await extract_resume_info(file);
    logger.info(`[UPLOAD] LLM parsing completed for source ${sourceId}`);
    
    // Update source with parsed data and metadata
    await supabaseAdmin
      .from('knowledge_sources')
      .update({
        processing_status: 'completed',
        parsed_data: parsedProfile,
        metadata: {
          file_size: file.size,
          mime_type: file.mimetype,
          original_name: file.originalname,
        },
      })
      .eq('id', sourceId);
    
    logger.info(`[UPLOAD] Marked source ${sourceId} as completed`);
  } catch (error) {
    logger.error(`[UPLOAD] Processing failed for source ${sourceId}:`, error);
    await markSourceAsFailed(sourceId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// ============================================================================
// POST /api/knowledge-sources/upload-project
// Upload and parse a project document (PDF, DOCX)
// ============================================================================

router.post('/upload-project', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logger.info(`[UPLOAD_PROJECT] Processing uploaded project document: ${file.originalname} for user ${userId}`);
    
    // Create pending source first
    const pendingSource = await createPendingKnowledgeSource(userId, 'project_document', file.originalname);
    
    // Process async (in background)
    processProjectDocument(pendingSource.id, userId, file).catch((error) => {
      logger.error(`[UPLOAD_PROJECT] Background processing failed for source ${pendingSource.id}:`, error);
    });
    
    res.json({
      source: pendingSource,
      message: 'Project document is being processed',
    });
  } catch (error) {
    logger.error('[UPLOAD_PROJECT] Failed to upload project document:', error);
    res.status(500).json({
      error: 'Failed to process project document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processProjectDocument(sourceId: string, userId: string, file: Express.Multer.File): Promise<void> {
  try {
    logger.info(`[UPLOAD_PROJECT] Starting LLM parsing for source ${sourceId}...`);
    await markSourceAsProcessing(sourceId);
    
    const parsedData = await extract_project_info(file);
    logger.info(`[UPLOAD_PROJECT] LLM parsing completed for source ${sourceId}. Projects: ${parsedData.projects?.length || 0}, Skills: ${parsedData.skills?.length || 0}`);
    
    // Update source with parsed data and metadata
    await supabaseAdmin
      .from('knowledge_sources')
      .update({
        processing_status: 'completed',
        parsed_data: parsedData,
        metadata: {
          file_size: file.size,
          mime_type: file.mimetype,
          original_name: file.originalname,
          document_type: 'project',
        },
      })
      .eq('id', sourceId);
    
    logger.info(`[UPLOAD_PROJECT] Marked source ${sourceId} as completed`);
  } catch (error) {
    logger.error(`[UPLOAD_PROJECT] Processing failed for source ${sourceId}:`, error);
    await markSourceAsFailed(sourceId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// ============================================================================
// POST /api/knowledge-sources/linkedin
// Add LinkedIn profile
// ============================================================================

router.post('/linkedin', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = linkedInSchema.parse(req.body);

    // Normalize LinkedIn input (username or URL) into a full https URL.
    let rawInput = String(body.url).trim();
    let normalizedUrl = rawInput;

    // If input doesn't contain 'linkedin.com', assume it's a username or profile path
    if (!/linkedin\.com/i.test(rawInput)) {
      // remove leading @ or slashes
      const username = rawInput.replace(/^@+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
      normalizedUrl = `https://www.linkedin.com/in/${username}`;
    } else {
      // Ensure scheme exists
      if (!/^https?:\/\//i.test(rawInput)) {
        normalizedUrl = `https://${rawInput}`;
      }
    }

    // Validate normalized URL
    try {
      // throws if invalid
      // eslint-disable-next-line no-new
      new URL(normalizedUrl);
    } catch (err) {
      logger.warn('Invalid LinkedIn URL after normalization:', normalizedUrl, err);
      return res.status(400).json({ error: 'Invalid LinkedIn URL', message: 'Provided LinkedIn URL is invalid' });
    }

    logger.info(`Processing LinkedIn profile: ${normalizedUrl}`);
    
    // Create pending source
    const pendingSource = await createPendingKnowledgeSource(userId, 'linkedin', normalizedUrl);

    // Process async (in background)
    processLinkedInProfile(pendingSource.id, userId, normalizedUrl).catch((error) => {
      logger.error(`Background LinkedIn processing failed for source ${pendingSource.id}:`, error);
    });
    
    res.json({
      source: pendingSource,
      message: 'LinkedIn profile is being processed',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error('Failed to add LinkedIn profile:', error);
    res.status(500).json({
      error: 'Failed to add LinkedIn profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processLinkedInProfile(sourceId: string, userId: string, url: string): Promise<void> {
  try {
    await markSourceAsProcessing(sourceId);
    const { raw, parsed } = await scrapeAndParseLinkedIn(url);
    await markSourceAsCompleted(sourceId, parsed, raw);
    
    logger.info(`Successfully processed LinkedIn profile for source ${sourceId}`);
  } catch (error) {
    await markSourceAsFailed(sourceId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// ============================================================================
// POST /api/knowledge-sources/github
// Add GitHub profile
// ============================================================================

router.post('/github', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = githubSchema.parse(req.body);
    
    const username = extractGitHubUsername(body.url);
    logger.info(`Processing GitHub profile: ${username}`);
    
    // Create pending source
    const pendingSource = await createPendingKnowledgeSource(userId, 'github', username);
    
    // Process async (in background)
    processGitHubProfile(pendingSource.id, userId, username).catch((error) => {
      logger.error(`Background GitHub processing failed for source ${pendingSource.id}:`, error);
    });
    
    res.json({
      source: pendingSource,
      message: 'GitHub profile is being processed',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error('Failed to add GitHub profile:', error);
    res.status(500).json({
      error: 'Failed to add GitHub profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processGitHubProfile(sourceId: string, userId: string, username: string): Promise<void> {
  try {
    await markSourceAsProcessing(sourceId);
    const { raw, parsed } = await scrapeAndParseGitHub(username);
    await markSourceAsCompleted(sourceId, parsed, raw);
    
    logger.info(`Successfully processed GitHub profile for source ${sourceId}`);
  } catch (error) {
    await markSourceAsFailed(sourceId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// ============================================================================
// POST /api/knowledge-sources/website
// Add personal website
// ============================================================================

router.post('/website', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = websiteSchema.parse(req.body);
    
    logger.info(`Processing website: ${body.url}`);
    
    // Create pending source
    const pendingSource = await createPendingKnowledgeSource(userId, 'personal_website', body.url);
    
    // Process async (in background)
    processWebsite(pendingSource.id, userId, body.url).catch((error) => {
      logger.error(`Background website processing failed for source ${pendingSource.id}:`, error);
    });
    
    res.json({
      source: pendingSource,
      message: 'Website is being processed',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error('Failed to add website:', error);
    res.status(500).json({
      error: 'Failed to add website',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processWebsite(sourceId: string, userId: string, url: string): Promise<void> {
  try {
    await markSourceAsProcessing(sourceId);
    const { raw, parsed } = await scrapeAndParseWebsite(url);
    await markSourceAsCompleted(sourceId, parsed, raw);
    
    logger.info(`Successfully processed website for source ${sourceId}`);
  } catch (error) {
    await markSourceAsFailed(sourceId, error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// ============================================================================
// POST /api/knowledge-sources/text
// Add manual text context
// ============================================================================

router.post('/text', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = manualTextSchema.parse(req.body);
    
    logger.info('Processing manual text context');
    
    // Store as-is with minimal parsing
    const parsedData: ParsedKnowledgeData = {
      about: body.content,
      summary: body.content.slice(0, 500),
    };
    
    const source = await createKnowledgeSource(userId, 'manual_text', parsedData, {
      sourceIdentifier: 'Manual Context',
      metadata: {
        length: body.content.length,
      },
    });
    
    // Respond immediately
    res.json({
      source,
      message: 'Manual context added successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    logger.error('Failed to add manual text:', error);
    res.status(500).json({
      error: 'Failed to add manual text',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// DELETE /api/knowledge-sources/:id
// Delete a knowledge source
// ============================================================================

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    await deleteKnowledgeSource(id, userId);
    
    // Respond immediately
    res.json({ message: 'Knowledge source deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete knowledge source:', error);
    res.status(500).json({
      error: 'Failed to delete knowledge source',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
