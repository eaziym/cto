import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { createStorage, type StorageAdapter } from './storage.js';
import { createRateLimiter } from './rateLimiter.js';
import { analyzeResume, isAllowedResumeMime } from './resume/analyzer.js';
import { extract_resume_info } from './resume/llm_analyzer.js';
import { get_score } from './resume/llm_scorer.js';
import type { RoleTemplate } from './seedJobs.js';
import { scoreCompass } from './scoreCompass.js';
import { scoreCompassWithLLM } from './llm_compass_scorer.js';
import { handleHRSearch, handleGetCachedHRContacts } from './hrSearch.js';
import { handleGenerateOutreach } from './hrOutreach.js';
import type { AssessmentInput, PlanTier, User } from './types.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';
import { supabaseAdmin } from './supabase.js';
import { fetchExternalJobs, filterJobs } from './jobs/external.js';
import { getMatchingJD } from './jobs/mockJDs.js';
import { fetchJobDescription, isInternSGCompany } from './jobs/jdFetcher.js';

// Import new knowledge base routes
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import preferencesRoutes from './routes/preferences.js';
import generateMaterialsRoutes from './routes/generateMaterials.js';

// ============================================================================
// HELPER FUNCTIONS FOR PROFILE TRANSFORMATION
// ============================================================================

/**
 * Infer education level from the education array
 */
function inferEducationLevel(education: Array<{ degree: string; institution: string; field_of_study: string; duration: string }>): 'Diploma' | 'Bachelors' | 'Masters' | 'PhD' | undefined {
  if (!education || education.length === 0) return undefined;
  
  // Look for highest degree
  const degrees = education.map(e => e.degree.toLowerCase());
  
  if (degrees.some(d => d.includes('phd') || d.includes('doctor'))) return 'PhD';
  if (degrees.some(d => d.includes('master') || d.includes('msc') || d.includes('mba'))) return 'Masters';
  if (degrees.some(d => d.includes('bachelor') || d.includes('bsc') || d.includes('ba ') || d.includes('b.a'))) return 'Bachelors';
  if (degrees.some(d => d.includes('diploma'))) return 'Diploma';
  
  // Default to Bachelors if we can't determine
  return 'Bachelors';
}

/**
 * Calculate years of experience from work history
 */
function inferYearsExperience(experience: Array<{ job_title: string; company: string; duration: string; description: string }>): number | undefined {
  if (!experience || experience.length === 0) return undefined;
  
  let totalMonths = 0;
  
  for (const exp of experience) {
    const duration = exp.duration.toLowerCase();
    
    // Try to parse duration strings like "Jan 2024 - Present", "2020 - 2023", etc.
    const yearMatches = duration.match(/(\d{4})/g);
    if (yearMatches && yearMatches.length >= 2) {
      const startYear = parseInt(yearMatches[0], 10);
      const endYear = duration.includes('present') ? new Date().getFullYear() : parseInt(yearMatches[yearMatches.length - 1], 10);
      totalMonths += (endYear - startYear) * 12;
    } else if (yearMatches && yearMatches.length === 1) {
      // Single year or ongoing, estimate 1 year
      totalMonths += 12;
    }
  }
  
  return totalMonths > 0 ? Math.round(totalMonths / 12) : undefined;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const assessmentSchema = z.object({
  user: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      gender: z.string().optional(),
      nationality: z.string().optional(),
      educationLevel: z.enum(['Diploma', 'Bachelors', 'Masters', 'PhD']).optional(),
      educationInstitution: z.string().optional(),
      certifications: z.array(z.string()).nullish(),
      yearsExperience: z.number().nullish(),
      skills: z.array(z.string()).optional(),
      expectedSalarySGD: z.number().nullish(),
      plan: z.enum(['freemium', 'standard', 'pro', 'ultimate']).optional()
    })
    .default({}),
  job: z
    .object({
      id: z.string().optional(),
      title: z.string().optional(),
      company: z.string().optional(),
      location: z.string().optional(),
      industry: z.string().optional(),
      salaryMinSGD: z.number().optional(),
      salaryMaxSGD: z.number().optional(),
      description: z.string().optional(),
      requirements: z.array(z.string()).optional(),
      employer: z
        .object({
          size: z.enum(['SME', 'MNC', 'Gov', 'Startup']),
          localHQ: z.boolean().optional(),
          diversityScore: z.number().optional()
        })
        .optional(),
      createdAt: z.string().optional()
    })
    .optional()
});

const applicationSchema = z.object({
  userId: z.string(),
  jobId: z.string()
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadMaxMb * 1024 * 1024
  }
});

const RESUME_RATE_LIMITER = createRateLimiter({
  capacity: 10,
  refillIntervalMs: 60 * 60 * 1000
});

const ALLOWED_ORIGINS = new Set([config.webOrigin]);

function corsValidator(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
  callback(new Error('Origin not allowed by CORS'));
}

function parseProfileFromRequest(req: Request): Partial<User> {
  const headerProfile = req.header('x-ep-profile');
  if (headerProfile) {
    try {
      return JSON.parse(headerProfile);
    } catch {
      logger.warn('Failed to parse profile from header.');
    }
  }

  const queryProfile = req.query.profile;
  if (typeof queryProfile === 'string') {
    try {
      return JSON.parse(queryProfile);
    } catch {
      logger.warn('Failed to parse profile from query parameter.');
    }
  }

  return {
    educationLevel: 'Bachelors',
    skills: [],
    plan: 'freemium'
  } satisfies Partial<User>;
}

function handleError(error: unknown, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err: error, url: req.originalUrl }, 'Request failed');
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: 'upload_error', message: error.message });
    return;
  }

  if (error instanceof Error) {
    res.status(400).json({ error: 'bad_request', message: error.message });
    return;
  }

  res.status(500).json({ error: 'unknown', message: 'Unexpected server error' });
}

function inferPlanFromProfile(profile: Partial<User>): PlanTier {
  if (profile.plan && ['freemium', 'standard', 'pro', 'ultimate'].includes(profile.plan)) {
    return profile.plan;
  }
  return 'freemium';
}

function extractUser(input: Partial<User>): Partial<User> {
  const plan = inferPlanFromProfile(input);
  return {
    ...input,
    plan,
    skills: input.skills ?? []
  };
}

export async function buildServer(): Promise<express.Express> {
  const app = express();
  const storage: StorageAdapter = await createStorage();

  app.use(
    cors({
      origin: corsValidator,
      credentials: true
    })
  );
  app.use(express.json());

  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/plans', (_req, res) => {
    res.json({
      items: [
        { id: 'freemium', label: 'Freemium', price: 0, resumeAnalysis: false },
        { id: 'standard', label: 'Standard', price: 39, resumeAnalysis: true },
        { id: 'pro', label: 'Pro', price: 89, resumeAnalysis: true },
        { id: 'ultimate', label: 'Ultimate', price: 149, resumeAnalysis: true }
      ],
      gating: {
        resumeAnalysis: true,
        applications: true
      }
    });
  });

  // ============================================================================
  // PROFILE ENDPOINTS
  // ============================================================================

  // Get current user's profile
  router.get('/profile', requireAuth, async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', req.user!.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found, which is ok
        throw error;
      }

      // If there's a COMPASS score, fetch the notes from the latest compass_scores record
      let latestNotes: string[] = [];
      if (data?.latest_compass_calculated_at) {
        const { data: compassData } = await supabaseAdmin
          .from('compass_scores')
          .select('notes')
          .eq('user_id', req.user!.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        latestNotes = compassData?.notes || [];
      }

      // Convert snake_case to camelCase for frontend
      const profile = data ? {
        id: data.id,
        name: data.name,
        gender: data.gender,
        nationality: data.nationality,
        educationLevel: data.education_level,
        educationInstitution: data.education_institution,
        certifications: data.certifications,
        yearsExperience: data.years_experience,
        skills: data.skills,
        expectedSalarySGD: data.expected_salary_sgd,
        plan: data.plan,
        latestCompassScore: data.latest_compass_score ? (
          typeof data.latest_compass_score === 'object'
            ? data.latest_compass_score
            : {
                totalRaw: data.latest_compass_score,
                total: Math.round((data.latest_compass_score / 110) * 100),
                verdict: data.latest_compass_verdict,
                breakdown: data.latest_compass_breakdown,
                notes: latestNotes,
                calculatedAt: data.latest_compass_calculated_at
              }
        ) : null,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      } : null;

      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  // Create or update user profile
  router.put('/profile', requireAuth, async (req, res, next) => {
    try {
      // Convert camelCase to snake_case for database
      const profileData = {
        id: req.user!.id,
        name: req.body.name,
        gender: req.body.gender,
        nationality: req.body.nationality,
        education_level: req.body.educationLevel,
        education_institution: req.body.educationInstitution,
        certifications: req.body.certifications,
        years_experience: req.body.yearsExperience,
        skills: req.body.skills,
        expected_salary_sgd: req.body.expectedSalarySGD,
        plan: req.body.plan || 'freemium',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;

      // Convert back to camelCase
      const profile = {
        id: data.id,
        name: data.name,
        gender: data.gender,
        nationality: data.nationality,
        educationLevel: data.education_level,
        educationInstitution: data.education_institution,
        certifications: data.certifications,
        yearsExperience: data.years_experience,
        skills: data.skills,
        expectedSalarySGD: data.expected_salary_sgd,
        plan: data.plan,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };

      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // JOBS ENDPOINTS (using external API)
  // ============================================================================

  // Get metadata (unique tags, companies) for filters
  router.get('/jobs/meta/filters', async (req, res, next) => {
    try {
      const externalJobs = await fetchExternalJobs();
      
      // Extract unique tags and companies
      const allTags = new Set<string>();
      const allCompanies = new Set<string>();
      
      externalJobs.forEach(job => {
        job.tags.forEach(tag => allTags.add(tag));
        allCompanies.add(job.company);
      });
      
      res.json({
        tags: Array.from(allTags).sort(),
        companies: Array.from(allCompanies).sort()
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs', optionalAuth, async (req, res, next) => {
    try {
      // Fetch jobs from external API
      const externalJobs = await fetchExternalJobs();
      
      // Parse pagination parameters
      const page = req.query.page ? Number.parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? Number.parseInt(req.query.pageSize as string, 10) : 50;
      const tags = typeof req.query.tags === 'string' ? req.query.tags : undefined;
      const company = typeof req.query.company === 'string' ? req.query.company : undefined;
      
      // Apply filters (but don't limit yet - we need total count)
      const filtered = filterJobs(externalJobs, {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        location: typeof req.query.location === 'string' ? req.query.location : undefined,
        industry: typeof req.query.industry === 'string' ? req.query.industry : undefined,
        tags: tags,
        company: company,
        limit: undefined // Don't apply limit in filter function
      });

      // Get user profile for scoring if authenticated
      let userProfile: Partial<User> | null = null;
      let userPreferences: { confirmed_industries?: string[]; confirmed_roles?: string[]; confirmed_companies?: string[] } | null = null;
      
      if (req.user) {
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', req.user.id)
          .single();
        
        if (data) {
          userProfile = {
            id: data.id,
            name: data.name,
            educationLevel: data.education_level,
            educationInstitution: data.education_institution,
            certifications: data.certifications,
            yearsExperience: data.years_experience,
            skills: data.skills || [],
            expectedSalarySGD: data.expected_salary_sgd,
            plan: data.plan || 'freemium'
          };
        }
        
        // Fetch user preferences for smart sorting
        const { data: prefsData } = await supabaseAdmin
          .from('user_preferences')
          .select('confirmed_industries, confirmed_roles, confirmed_companies')
          .eq('user_id', req.user.id)
          .single();
        
        if (prefsData) {
          userPreferences = prefsData;
        }
      }

      // Map jobs to include requirements field (for frontend compatibility)
      const mappedJobs = filtered.map(job => ({
        ...job,
        requirements: job.tags, // Map tags to requirements for frontend
      }));

      // Sort by preference matches if user has preferences
      let sortedJobs = mappedJobs;
      if (userPreferences && (userPreferences.confirmed_industries?.length || userPreferences.confirmed_roles?.length || userPreferences.confirmed_companies?.length)) {
        const roles = userPreferences.confirmed_roles || [];
        const companies = userPreferences.confirmed_companies || [];
        const industries = userPreferences.confirmed_industries || [];
        
        sortedJobs = mappedJobs.map(job => {
          let matchCount = 0;
          
          // Check title matches role
          if (roles.some(role => 
            role.toLowerCase().includes(job.title.toLowerCase()) || 
            job.title.toLowerCase().includes(role.toLowerCase())
          )) {
            matchCount++;
          }
          
          // Check company matches
          if (companies.some(comp => 
            comp.toLowerCase().includes(job.company.toLowerCase()) || 
            job.company.toLowerCase().includes(comp.toLowerCase())
          )) {
            matchCount++;
          }
          
          // Check tags/requirements match industry
          if (industries.some(industry => 
            (job.tags || []).some(tag => 
              industry.toLowerCase().includes(tag.toLowerCase()) || 
              tag.toLowerCase().includes(industry.toLowerCase())
            )
          )) {
            matchCount++;
          }
          
          // Check job industry matches
          if (job.industry && industries.some(industry => 
            industry.toLowerCase().includes(job.industry!.toLowerCase()) || 
            job.industry!.toLowerCase().includes(industry.toLowerCase())
          )) {
            matchCount++;
          }
          
          return { ...job, matchCount };
        }).sort((a, b) => b.matchCount - a.matchCount);
      }

      // Apply pagination
      const total = sortedJobs.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedItems = sortedJobs.slice(startIndex, endIndex);

      res.json({ 
        items: paginatedItems, 
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/:id', optionalAuth, async (req, res, next) => {
    try {
      const externalJobs = await fetchExternalJobs();
      
      // Find job by ID (no need to decode since we're using URL-safe slugs now)
      const job = externalJobs.find(j => j.id === req.params.id);
      
      if (!job) {
        logger.warn({ requestedId: req.params.id, totalJobs: externalJobs.length }, 'Job not found');
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }

      // Fetch real JD from webhook
      const jdData = await fetchJobDescription(job.url, job.company);
      
      // Determine if this is an InternSG company (smaller company)
      const isInternSG = isInternSGCompany(job.company);
      
      // Get user profile for scoring if authenticated
      let userProfile: Partial<User> | null = null;
      if (req.user) {
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', req.user.id)
          .single();
        
        if (data) {
          userProfile = {
            id: data.id,
            name: data.name,
            educationLevel: data.education_level,
            educationInstitution: data.education_institution,
            certifications: data.certifications,
            yearsExperience: data.years_experience,
            skills: data.skills || [],
            expectedSalarySGD: data.expected_salary_sgd,
            plan: data.plan || 'freemium'
          };
        }
      }

      const score = scoreCompass({
        user: userProfile || {},
        job: {
          title: job.title,
          company: job.company,
          location: job.location,
          industry: job.industry,
          requirements: job.tags
        }
      });

      // Use real JD text if available, otherwise fall back to basic description
      let description = jdData?.jdText || `Join ${job.company} as a ${job.title}. This role offers an exciting opportunity to work in ${job.location}. Posted on ${job.date}.\n\nFor more details and to apply, visit: ${job.url}`;
      
      // Add InternSG notice if applicable (will be rendered separately in frontend)
      // Don't add it to description since frontend handles it with a special component

      // Map external job to expected Job interface
      res.json({
        id: job.id,
        title: jdData?.title || job.title,
        company: job.company,
        location: jdData?.location || job.location,
        industry: job.industry || 'Technology',
        description,
        requirements: job.tags,
        salaryMinSGD: undefined,
        salaryMaxSGD: undefined,
        employer: {
          size: 'medium',
          diversityScore: 0.7,
          hasSponsorship: true
        },
        createdAt: jdData?.postedAt || job.date,
        url: job.url,
        applyUrl: jdData?.applyUrl || job.url,
        score: score.total,
        scoreRaw: score.totalRaw,
        epIndicator: score.verdict,
        rationale: score.notes.slice(0, 4),
        breakdown: score.breakdown,
        // Additional metadata
        isInternSG,
        hrName: jdData?.hrName,
        source: jdData?.source || 'External API'
      });
    } catch (error) {
      next(error);
    }
  });

  // Get existing assessment for a job (without generating new one)
  router.get('/jobs/:id/assessment', requireAuth, async (req, res, next) => {
    try {
      const externalJobs = await fetchExternalJobs();
      const job = externalJobs.find(j => j.id === req.params.id);
      
      if (!job) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }

      // Get the most recent resume analysis
      const { data: resumeAnalysis } = await supabaseAdmin
        .from('resume_analyses')
        .select('id')
        .eq('user_id', req.user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!resumeAnalysis) {
        res.status(404).json({ error: 'not_found', message: 'No assessment found' });
        return;
      }

      // Check if we have an existing assessment
      const { data: existingAssessment, error } = await supabaseAdmin
        .from('job_assessments')
        .select('*')
        .eq('user_id', req.user!.id)
        .eq('job_external_id', req.params.id)
        .eq('resume_analysis_id', resumeAnalysis.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !existingAssessment) {
        res.status(404).json({ error: 'not_found', message: 'No assessment found' });
        return;
      }

      // Return existing assessment
      res.json({
        ...existingAssessment,
        subscores: existingAssessment.subscores as any,
        evidence: existingAssessment.evidence as any,
        gaps: existingAssessment.gaps as any,
        questions_for_interview: existingAssessment.questions_for_interview as string[],
        recommendations_to_candidate: existingAssessment.recommendations_to_candidate as string[],
        from_cache: true
      });
    } catch (error) {
      next(error);
    }
  });

  // Analyze job fit with comprehensive LLM report
  router.post('/jobs/:id/analyze', requireAuth, async (req, res, next) => {
    try {
      const { regenerate } = req.body; // Allow forcing regeneration
      const externalJobs = await fetchExternalJobs();
      const job = externalJobs.find(j => j.id === req.params.id);
      
      if (!job) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }

      // Get the unified knowledge base summary from profiles table
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('knowledge_base_summary, knowledge_base_updated_at')
        .eq('id', req.user!.id)
        .single();

      if (profileError || !profileData || !profileData.knowledge_base_summary) {
        res.status(400).json({ 
          error: 'missing_profile', 
          message: 'Please upload your resume or connect LinkedIn first to get a detailed analysis' 
        });
        return;
      }

      const knowledgeBase = profileData.knowledge_base_summary as any;

      // Check if we have an existing assessment for this job with this knowledge base version
      if (!regenerate) {
        const { data: existingAssessment } = await supabaseAdmin
          .from('job_assessments')
          .select('*')
          .eq('user_id', req.user!.id)
          .eq('job_external_id', req.params.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingAssessment) {
          // Return existing assessment
          res.json({
            ...existingAssessment,
            subscores: existingAssessment.subscores as any,
            evidence: existingAssessment.evidence as any,
            gaps: existingAssessment.gaps as any,
            questions_for_interview: existingAssessment.questions_for_interview as string[],
            recommendations_to_candidate: existingAssessment.recommendations_to_candidate as string[],
            from_cache: true
          });
          return;
        }
      }

      // Generate new assessment
      // Fetch real JD from webhook
      const jdData = await fetchJobDescription(job.url, job.company);
      const jobDescription = jdData?.jdText || `${job.title} at ${job.company}. Location: ${job.location}. Tags: ${job.tags.join(', ')}`;

      // Create role template for comprehensive LLM scorer
      const roleTemplate: RoleTemplate = {
        title: jdData?.title || job.title,
        industry: job.industry || 'Technology',
        baseSalary: [5000, 10000], // Default range
        requirements: job.tags,
        description: jobDescription
      };

      // Use comprehensive LLM scoring with detailed analysis
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const system_prompt = fs.readFileSync(
        path.join("resources", "llm_prompts", "profile_jd_score_system.txt"), 
        "utf8"
      );
      
      let user_prompt = fs.readFileSync(
        path.join("resources", "llm_prompts", "profile_jd_score_user.txt"), 
        "utf8"
      );

      // Format the prompt with job details
      user_prompt = user_prompt.replace("{{ role_title }}", roleTemplate.title);
      user_prompt = user_prompt.replace("{{ industry }}", roleTemplate.industry);
      user_prompt = user_prompt.replace("{{ base_salary }}", roleTemplate.baseSalary[0] + " - " + roleTemplate.baseSalary[1]);
      user_prompt = user_prompt.replace("{{ job_requirements }}", roleTemplate.requirements.join("\n"));
      user_prompt = user_prompt.replace("{{ job_description }}", roleTemplate.description);

      // Add candidate profile from unified knowledge base
      user_prompt += "\n\n# CANDIDATE PROFILE DATA\n\n";
      user_prompt += `Name: ${knowledgeBase.name}\n`;
      user_prompt += `Email: ${knowledgeBase.email}\n`;
      if (knowledgeBase.phone) {
        user_prompt += `Phone: ${knowledgeBase.phone}\n`;
      }
      if (knowledgeBase.education) {
        user_prompt += `\nEducation:\n${knowledgeBase.education.map((e: any) => 
          `- ${e.degree || 'Degree'} at ${e.institution} (${e.duration || ''})`
        ).join('\n')}\n`;
      }
      if (knowledgeBase.experience) {
        user_prompt += `\nWork Experience:\n${knowledgeBase.experience.map((e: any) => 
          `- ${e.job_title} at ${e.company} (${e.duration})\n  ${e.description || ''}`
        ).join('\n\n')}\n`;
      }
      if (knowledgeBase.skills) {
        user_prompt += `\nSkills: ${knowledgeBase.skills.join(', ')}\n`;
      }
      if (knowledgeBase.certifications && knowledgeBase.certifications.length > 0) {
        user_prompt += `\nCertifications: ${knowledgeBase.certifications.map((c: any) => c.name || c).join(', ')}\n`;
      }
      if (knowledgeBase.projects && knowledgeBase.projects.length > 0) {
        user_prompt += `\nProjects:\n${knowledgeBase.projects.map((p: any) => 
          `- ${p.name}: ${p.description}`
        ).join('\n')}\n`;
      }

      // Import ProfileSchema from llm_scorer
      const { ProfileSchema } = await import('./resume/llm_scorer.js');

      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: system_prompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: user_prompt }]
          }
        ],
        text: {
          format: zodTextFormat(ProfileSchema as any, "profile"),
        },
      });

      // Parse the comprehensive assessment
      const assessment = JSON.parse(response.output_text);
      
      // Save to database (without resume_analysis_id since we're using knowledge_base_summary)
      const { data: savedAssessment, error: saveError } = await supabaseAdmin
        .from('job_assessments')
        .upsert({
          user_id: req.user!.id,
          job_external_id: req.params.id,
          job_title: job.title,
          job_company: job.company,
          resume_analysis_id: null, // No longer tied to specific resume analysis
          candidate_name: assessment.candidate_name,
          candidate_email: assessment.candidate_email,
          role_title: assessment.role_title,
          overall_score: assessment.overall_score,
          must_have_coverage: assessment.must_have_coverage,
          subscores: assessment.subscores,
          decision: assessment.decision,
          evidence: assessment.evidence,
          gaps: assessment.gaps,
          questions_for_interview: assessment.questions_for_interview,
          recommendations_to_candidate: assessment.recommendations_to_candidate,
          notes: assessment.notes
        }, {
          onConflict: 'user_id,job_external_id'
        })
        .select()
        .single();

      if (saveError) {
        logger.error({ error: saveError }, 'Failed to save job assessment');
      }

      res.json({
        ...assessment,
        from_cache: false
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/jobs/:id', async (req, res, next) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }
      const user = extractUser(parseProfileFromRequest(req));
      const score = scoreCompass({ user, job });
      res.json({
        ...job,
        score: score.total,
        epIndicator: score.verdict,
        rationale: score.notes.slice(0, 4),
        breakdown: score.breakdown
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/assessments/compass', requireAuth, async (req, res, next) => {
    try {
      const payload = assessmentSchema.parse(req.body) as AssessmentInput;
      
      // Use LLM-based scoring instead of hardcoded logic
      const score = await scoreCompassWithLLM(payload);
      
      // Save compass score to database
      await supabaseAdmin.from('compass_scores').insert({
        user_id: req.user!.id,
        profile_snapshot: payload.user,
        total_score: (score as any).totalRaw ?? score.total,
        verdict: score.verdict,
        breakdown: score.breakdown,
        notes: score.notes,
        job_context: payload.job || null
      });

      // Also update the latest score in profiles table for quick access
      await supabaseAdmin
        .from('profiles')
        .update({
          latest_compass_score: (score as any).totalRaw ?? score.total,
          latest_compass_verdict: score.verdict,
          latest_compass_breakdown: score.breakdown,
          latest_compass_calculated_at: new Date().toISOString()
        })
        .eq('id', req.user!.id);

      logger.info({ 
        userId: req.user!.id, 
        score: score.total,
        verdict: score.verdict 
      }, 'COMPASS score calculated and saved');
      
      res.json({ score });
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // APPLICATIONS ENDPOINTS
  // ============================================================================

  // HR Outreach - Send contact request to HR
  router.post('/hr/outreach', requireAuth, async (req, res, next) => {
    try {
      const { jobId, jobTitle, jobCompany, message } = req.body;

      if (!jobId || !jobTitle || !jobCompany) {
        res.status(400).json({ 
          error: 'missing_fields', 
          message: 'jobId, jobTitle, and jobCompany are required' 
        });
        return;
      }

      // Get user profile for the outreach
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('name, email')
        .eq('id', req.user!.id)
        .single();

      // In a real system, this would send an email or create a ticket
      // For now, we'll just log it and return success
      logger.info({
        userId: req.user!.id,
        userName: profile?.name,
        userEmail: profile?.email,
        jobId,
        jobTitle,
        jobCompany,
        message: message || 'User requested HR contact'
      }, 'HR outreach request');

      // Simulate async processing
      await new Promise(resolve => setTimeout(resolve, 500));

      res.json({
        success: true,
        message: 'Your contact request has been sent to HR. They will reach out within 2-3 business days.',
        requestId: `hr-${Date.now()}-${req.user!.id.substring(0, 8)}`
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/applications', requireAuth, async (req, res, next) => {
    try {
      const applicationData = {
        user_id: req.user!.id,
        job_external_id: req.body.jobId,
        job_title: req.body.jobTitle,
        job_company: req.body.jobCompany,
        job_url: req.body.jobUrl,
        status: req.body.status || 'draft',
        notes: req.body.notes,
        applied_at: req.body.appliedAt ? new Date(req.body.appliedAt).toISOString() : null
      };

      const { data, error } = await supabaseAdmin
        .from('applications')
        .insert(applicationData)
        .select()
        .single();

      if (error) throw error;

      // Convert to camelCase
      const application = {
        id: data.id,
        userId: data.user_id,
        jobId: data.job_external_id,
        jobTitle: data.job_title,
        jobCompany: data.job_company,
        jobUrl: data.job_url,
        status: data.status,
        notes: data.notes,
        appliedAt: data.applied_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };

      res.status(201).json(application);
    } catch (error) {
      next(error);
    }
  });

  router.get('/applications', requireAuth, async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('applications')
        .select('*')
        .eq('user_id', req.user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Convert to camelCase
      const applications = (data || []).map(app => ({
        id: app.id,
        userId: app.user_id,
        jobId: app.job_external_id,
        jobTitle: app.job_title,
        jobCompany: app.job_company,
        jobUrl: app.job_url,
        status: app.status,
        notes: app.notes,
        appliedAt: app.applied_at,
        createdAt: app.created_at,
        updatedAt: app.updated_at
      }));

      res.json({ items: applications });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/applications/:id', requireAuth, async (req, res, next) => {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (req.body.status) updateData.status = req.body.status;
      if (req.body.notes !== undefined) updateData.notes = req.body.notes;
      if (req.body.appliedAt) updateData.applied_at = new Date(req.body.appliedAt).toISOString();

      const { data, error } = await supabaseAdmin
        .from('applications')
        .update(updateData)
        .eq('id', req.params.id)
        .eq('user_id', req.user!.id) // Ensure user owns this application
        .select()
        .single();

      if (error) throw error;
      
      if (!data) {
        res.status(404).json({ error: 'not_found', message: 'Application not found' });
        return;
      }

      // Convert to camelCase
      const application = {
        id: data.id,
        userId: data.user_id,
        jobId: data.job_external_id,
        jobTitle: data.job_title,
        jobCompany: data.job_company,
        jobUrl: data.job_url,
        status: data.status,
        notes: data.notes,
        appliedAt: data.applied_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };

      res.json(application);
    } catch (error) {
      next(error);
    }
  });

  // ============================================================================
  // RESUME ANALYSIS ENDPOINTS
  // ============================================================================

  // Get all resume analyses for the current user
  router.get('/resume/analyses', requireAuth, async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('resume_analyses')
        .select('*')
        .eq('user_id', req.user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({ analyses: data || [] });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/resume/analyze',
    requireAuth,
    RESUME_RATE_LIMITER,
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'missing_file', message: 'Resume file is required.' });
          return;
        }
        
        if (!isAllowedResumeMime(req.file.mimetype)) {
          res.status(400).json({ 
            error: 'unsupported_type', 
            message: 'Only PDF or DOCX resumes are supported.' 
          });
          return;
        }

        const startTime = Date.now();

        // Use LLM to extract profile information
        const llmProfile = await extract_resume_info(req.file);

        // Transform LLM output to match frontend ParsedProfile interface
        const parsedProfile = {
          name: llmProfile.name,
          email: llmProfile.email,
          skills: llmProfile.skills || [],
          educationLevel: inferEducationLevel(llmProfile.education),
          educationInstitution: llmProfile.education?.[0]?.institution, // Get first/highest institution
          yearsExperience: inferYearsExperience(llmProfile.experience),
          lastTitle: llmProfile.experience?.[0]?.job_title,
          nationality: undefined, // Not extracted by LLM
          gender: undefined // Not extracted by LLM
        };

        const processingTime = Date.now() - startTime;

        // Save analysis to database (save full LLM output for reference)
        await supabaseAdmin.from('resume_analyses').insert({
          user_id: req.user!.id,
          file_name: req.file.originalname,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          parsed_data: llmProfile, // Save full LLM output
          processing_time_ms: processingTime
        });

        logger.info({ 
          userId: req.user!.id, 
          fileName: req.file.originalname,
          processingTime 
        }, 'Resume analyzed successfully');

        res.json({ profile: parsedProfile });
      } catch (error) {
        logger.error({ err: error }, 'Resume analysis failed');
        next(error);
      }
    }
  );

  router.post('/hr/search', handleHRSearch);
  
  // Get cached HR contacts (no external API call)
  router.get('/hr/cache', handleGetCachedHRContacts);
  
  // Generate HR outreach message
  router.post('/hr/outreach/generate', requireAuth, handleGenerateOutreach);

  // Knowledge base routes
  app.use('/api/knowledge-sources', knowledgeBaseRoutes);
  
  // User preferences routes
  app.use('/api/preferences', preferencesRoutes);
  
  // Material generation routes
  app.use('/api/generate', generateMaterialsRoutes);

  app.use('/api', router);
  app.use(handleError);

  return app;
}

export async function startServer(): Promise<void> {
  const app = await buildServer();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API listening');
  });

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info({ signal }, 'Shutting down');
      server.close(() => process.exit(0));
    });
  });
}
