// AI Preference Predictor
// Predicts user's preferred industries, roles, and companies based on knowledge base

import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { logger } from '../logger.js';
import type { AggregatedKnowledgeBase } from '../knowledge/aggregator.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface Prediction {
  name: string;
  confidence: number;
  reasoning: string;
}

export interface PredictionResult {
  industries: Prediction[];
  roles: Prediction[];
  companies: Prediction[];
}

export async function predictPreferences(
  knowledgeBase: AggregatedKnowledgeBase
): Promise<PredictionResult> {
  logger.info('Predicting user preferences from knowledge base');
  
  try {
    const prompt = await loadPrompt('predict_preferences.txt');
    
    // Prepare knowledge base summary for LLM
    const knowledgeSummary = {
      skills: (knowledgeBase.skills || []).slice(0, 30), // Top 30 skills
      experience: (knowledgeBase.experience || []).slice(0, 5).map((exp) => ({
        job_title: exp.job_title,
        company: exp.company,
        duration: exp.duration,
        description: exp.description?.slice(0, 200) || '', // Truncate
      })),
      education: (knowledgeBase.education || []).map((edu) => ({
        institution: edu.institution,
        degree: edu.degree,
        field_of_study: edu.field_of_study,
      })),
      projects: (knowledgeBase.projects || []).slice(0, 5).map((proj) => ({
        name: proj.name,
        description: proj.description?.slice(0, 150) || '',
        technologies: proj.technologies || [],
      })),
      certifications: (knowledgeBase.certifications || []).map((cert) => ({
        name: cert.name,
        issuer: cert.issuer,
      })),
    };
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: JSON.stringify(knowledgeSummary, null, 2),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    logger.info(`Predicted preferences: ${result.industries?.length} industries, ${result.roles?.length} roles, ${result.companies?.length} companies`);
    
    return {
      industries: result.industries || [],
      roles: result.roles || [],
      companies: result.companies || [],
    };
  } catch (error) {
    logger.error('Failed to predict preferences:', error);
    
    // Ensure we have a proper error message
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    throw new Error(`Failed to predict preferences: ${errorMessage}`);
  }
}

async function loadPrompt(filename: string): Promise<string> {
  const promptPath = path.join(process.cwd(), 'resources', 'llm_prompts', filename);
  return fs.promises.readFile(promptPath, 'utf8');
}
