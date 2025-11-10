import { supabase } from '../lib/supabase';
import { useProfileStore } from '../store/profile';
import type { Application, CompassScore, CompassBreakdown, CompassVerdict, Job, ParsedProfile, User, EmployerMeta } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

/**
 * Get authentication headers from Supabase session
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.access_token) {
    return {
      'Authorization': `Bearer ${session.access_token}`
    };
  }
  
  return {};
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, 'http://cto.local');
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${base}${url.pathname}${url.search}`;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const { query, headers, body, ...rest } = options;
  const url = buildUrl(path, query);

  // Get auth headers from Supabase
  const authHeaders = await getAuthHeaders();
  
  const mergedHeaders = new Headers(headers);
  
  // Add auth header
  Object.entries(authHeaders).forEach(([key, value]) => {
    mergedHeaders.set(key, value);
  });
  
  if (body && !(body instanceof FormData)) {
    mergedHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...rest,
    headers: mergedHeaders,
    body: body instanceof FormData ? body : (body as string | undefined)
  });

  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const payload = await response.json();
      errorMessage = payload.message ?? payload.error ?? errorMessage;
    } catch (e) {
      // If JSON parsing fails, try to get text
      const text = await response.text().catch(() => '');
      if (text) {
        errorMessage = text;
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    }
    throw new Error(errorMessage);
  }

  // Check if response has content
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    // If not JSON, return empty object or throw error
    const text = await response.text();
    if (!text) {
      return {} as T;
    }
    throw new Error(`Expected JSON response but got: ${contentType}`);
  }

  try {
    return await response.json() as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface JobsQueryParams {
  limit?: number;
  page?: number;
  pageSize?: number;
  search?: string;
  location?: string;
  industry?: string;
  minSalary?: number;
  tags?: string;
  company?: string;
}

export interface JobsResponse {
  items: Job[];
  total: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

export interface JobDetailResponse {
  id: string;
  title: string;
  company: string;
  location: string;
  industry: string;
  salaryMinSGD?: number;
  salaryMaxSGD?: number;
  description: string;
  requirements: string[];
  employer: EmployerMeta;
  createdAt: string;
  url?: string;
  applyUrl?: string;
  score: number;
  scoreRaw: number;
  epIndicator: string;
  rationale: string[];
  breakdown?: CompassBreakdown;
  isInternSG?: boolean;
  hrName?: string;
  source?: string;
}

export interface JobFiltersMetadata {
  tags: string[];
  companies: string[];
}

export function fetchJobs(params: JobsQueryParams): Promise<JobsResponse> {
  return apiFetch<JobsResponse>('/jobs', { method: 'GET', query: params as Record<string, string | number | undefined> });
}

export function fetchJobFilters(): Promise<JobFiltersMetadata> {
  return apiFetch<JobFiltersMetadata>('/jobs/meta/filters', { method: 'GET' });
}

export function fetchJob(id: string): Promise<JobDetailResponse> {
  return apiFetch(`/jobs/${id}`, { method: 'GET' });
}

export function assessCompass(payload: { user: Record<string, unknown>; job?: Record<string, unknown> }): Promise<{ score: CompassScore }> {
  return apiFetch('/assessments/compass', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export interface ResumeAnalyzeResponse {
  profile: ParsedProfile;
}

export function analyzeResume(file: File, jobId?: string): Promise<ResumeAnalyzeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (jobId) {
    formData.append('jobId', jobId);
  }
  return apiFetch('/resume/analyze', {
    method: 'POST',
    body: formData
  });
}

// ============================================================================
// PROFILE API
// ============================================================================

export interface ProfileData {
  id?: string;
  name?: string;
  gender?: string;
  nationality?: string;
  educationLevel?: 'Diploma' | 'Bachelors' | 'Masters' | 'PhD';
  educationInstitution?: string;
  certifications?: string[];
  yearsExperience?: number;
  skills?: string[];
  expectedSalarySGD?: number;
  plan?: 'freemium' | 'standard' | 'pro' | 'ultimate';
  latestCompassScore?: {
    total: number;
    totalRaw?: number;
    verdict: CompassVerdict;
    breakdown: CompassBreakdown;
    notes: string[];
    calculatedAt?: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export function fetchProfile(): Promise<ProfileData | null> {
  return apiFetch('/profile', { method: 'GET' });
}

export function saveProfile(profile: ProfileData): Promise<ProfileData> {
  return apiFetch('/profile', {
    method: 'PUT',
    body: JSON.stringify(profile)
  });
}

// ============================================================================
// JOB ANALYSIS API
// ============================================================================

export interface JobAnalysisResponse {
  candidate_name: string;
  candidate_email: string;
  role_title: string;
  overall_score: number;
  must_have_coverage: number;
  subscores: {
    must_have: number;
    nice_to_have: number;
    role_level_match: number;
    domain_fit: number;
    impact_evidence: number;
    tools_stack: number;
    communication: number;
  };
  decision: "strong_match" | "possible_match" | "weak_match" | "reject";
  evidence: {
    matched_must_haves: string[];
    matched_nice_to_haves: string[];
    impact_highlights: string[];
    tools_stack_matched: string[];
  };
  gaps: {
    missing_must_haves: string[];
    risks: string[];
  };
  questions_for_interview: string[];
  recommendations_to_candidate: string[];
  notes: string;
  compass_score?: CompassScore; // Recalculated COMPASS score based on detailed JD
  from_cache?: boolean;
}

export function fetchExistingAssessment(jobId: string): Promise<JobAnalysisResponse> {
  return apiFetch(`/jobs/${jobId}/assessment`, {
    method: 'GET'
  });
}

export function analyzeJobFit(jobId: string, regenerate = false): Promise<JobAnalysisResponse> {
  return apiFetch(`/jobs/${jobId}/analyze`, {
    method: 'POST',
    body: JSON.stringify({ regenerate })
  });
}

// ============================================================================
// APPLICATIONS API
// ============================================================================

export interface CreateApplicationPayload {
  jobId: string;
  jobTitle: string;
  jobCompany: string;
  jobUrl?: string;
  status?: string;
  notes?: string;
  appliedAt?: string;
}

export function createApplication(payload: CreateApplicationPayload): Promise<Application> {
  return apiFetch('/applications', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ============================================================================
// HR OUTREACH API
// ============================================================================

export interface HRProspect {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  personal_email: string | null;
  job_title: string;
  linkedin: string;
  company_name: string;
  company_domain: string;
  city: string;
  country: string;
}

export interface HRSearchPayload {
  company_domain: string;
  fetch_count?: number;
}

export interface HRSearchResponse {
  prospects: HRProspect[];
  company_domain: string;
  fetch_count: number;
  file_name: string;
  timestamp: string;
}

export function searchHRContacts(payload: HRSearchPayload): Promise<HRSearchResponse> {
  return apiFetch('/hr/search', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getCachedHRContacts(companyDomain: string): Promise<HRSearchResponse> {
  return apiFetch(`/hr/cache?company_domain=${encodeURIComponent(companyDomain)}`, {
    method: 'GET'
  });
}

// Generate HR outreach message
export interface OutreachMessagePayload {
  job_external_id: string;
  job_title: string;
  job_company: string;
  // job_description is now fetched by backend, no need to pass it
  hr_name: string;
  hr_email?: string;
  hr_job_title?: string;
}

export interface OutreachMessageResponse {
  subject: string;
  body: string;
}

export function generateOutreachMessage(payload: OutreachMessagePayload): Promise<OutreachMessageResponse> {
  return apiFetch('/hr/outreach/generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ============================================================================
// APPLICATIONS API
// ============================================================================

export function fetchApplications(): Promise<{ items: Application[] }> {
  return apiFetch('/applications', { method: 'GET' });
}

export function updateApplication(id: string, updates: { status?: string; notes?: string }): Promise<Application> {
  return apiFetch(`/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export function fetchPlans(): Promise<{ items: Array<{ id: string; label: string; price: number }>; gating: Record<string, boolean> }> {
  return apiFetch('/plans', { method: 'GET' });
}

// ============================================================================
// RESUME ANALYSIS API
// ============================================================================

export interface ResumeAnalysis {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  parsed_data: {
    name: string;
    email: string;
    telephone: string;
    education: Array<{
      institution: string;
      degree: string;
      field_of_study: string;
      duration: string;
    }>;
    skills: string[];
    experience: Array<{
      job_title: string;
      company: string;
      duration: string;
      description: string;
    }>;
  };
  processing_time_ms: number;
  created_at: string;
}

export function fetchResumeAnalyses(): Promise<{ analyses: ResumeAnalysis[] }> {
  return apiFetch('/resume/analyses', { method: 'GET' });
}

// ============================================================================
// KNOWLEDGE BASE API
// ============================================================================

export type KnowledgeSourceType =
  | 'resume'
  | 'linkedin'
  | 'github'
  | 'personal_website'
  | 'project_document'
  | 'portfolio'
  | 'other_document'
  | 'manual_text';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeSource {
  id: string;
  user_id: string;
  source_type: KnowledgeSourceType;
  source_identifier?: string;
  raw_content?: any;
  parsed_data: any;
  metadata?: Record<string, any>;
  processing_status: ProcessingStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface PredictionItem {
  name: string;
  confidence: number;
  reasoning: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  
  // AI-predicted preferences (JSONB with confidence scores)
  predicted_industries?: PredictionItem[];
  predicted_roles?: PredictionItem[];
  predicted_companies?: PredictionItem[];
  
  // User-confirmed preferences (arrays)
  confirmed_industries?: string[];
  confirmed_roles?: string[];
  confirmed_companies?: string[];
  
  // Free-form "Other" options
  other_industries?: string;
  other_roles?: string;
  other_companies?: string;
  
  // Additional context
  additional_context?: string;
  
  // Metadata
  prediction_metadata?: {
    model: string;
    timestamp: string;
    knowledge_sources_count: number;
    [key: string]: any;
  };
  last_predicted_at?: string;
  
  created_at: string;
  updated_at: string;
}

export interface GeneratedMaterial {
  id: string;
  user_id: string;
  job_id: string;
  material_type: 'resume' | 'cover_letter';
  content: string;
  metadata: {
    word_count: number;
    generated_at: string;
    [key: string]: any;
  };
  created_at: string;
}

export interface AggregatedProfile {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  about?: string;
  skills: string[];
  technical_skills: string[];
  soft_skills: string[];
  languages: Array<{ language: string; proficiency: string }>;
  experience: Array<{
    job_title?: string;
    title?: string;
    company: string;
    location?: string;
    duration: string;
    description: string;
    start_date?: { year: number; month?: string };
    end_date?: { year: number; month?: string };
    is_current?: boolean;
    skills?: string[];
    source?: string;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field_of_study: string;
    duration: string;
    start_date?: { year: number };
    end_date?: { year: number };
    gpa?: string;
    source?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    issued_date?: string;
    expiry_date?: string;
    source?: string;
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies?: string[];
    url?: string;
    start_date?: string;
    end_date?: string;
    source?: string;
  }>;
  interests: string[];
  publications: string[];
  awards: string[];
  linkedin_profile_url?: string;
  github_username?: string;
  personal_website_urls: string[];
  sources: Array<{
    type: string;
    identifier?: string;
    created_at: string;
  }>;
  updated_at?: string; // Timestamp of when this profile was last aggregated
}

// Knowledge Sources
export function fetchKnowledgeSources(): Promise<{ sources: KnowledgeSource[] }> {
  return apiFetch('/knowledge-sources', { method: 'GET' });
}

export function fetchAggregatedProfile(): Promise<{ aggregated_profile: AggregatedProfile | null }> {
  return apiFetch('/knowledge-sources/aggregate', { method: 'GET' });
}

export function uploadKnowledgeDocument(file: File): Promise<{ source: KnowledgeSource; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/knowledge-sources/upload', {
    method: 'POST',
    body: formData,
  });
}

export function uploadProjectDocument(file: File): Promise<{ source: KnowledgeSource; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  return apiFetch('/knowledge-sources/upload-project', {
    method: 'POST',
    body: formData,
  });
}

export function addLinkedInProfile(url: string): Promise<{ source: KnowledgeSource; message: string }> {
  return apiFetch('/knowledge-sources/linkedin', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function addGitHubProfile(url: string): Promise<{ source: KnowledgeSource; message: string }> {
  return apiFetch('/knowledge-sources/github', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function addWebsite(url: string): Promise<{ source: KnowledgeSource; message: string }> {
  return apiFetch('/knowledge-sources/website', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function addManualText(content: string): Promise<{ source: KnowledgeSource; message: string }> {
  return apiFetch('/knowledge-sources/text', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function deleteKnowledgeSource(id: string): Promise<{ message: string }> {
  return apiFetch(`/knowledge-sources/${id}`, { method: 'DELETE' });
}

// User Preferences
export function fetchUserPreferences(): Promise<{ preferences: UserPreferences | null }> {
  return apiFetch('/preferences', { method: 'GET' });
}

export function predictPreferences(): Promise<{ preferences: UserPreferences; message: string }> {
  return apiFetch('/preferences/predict', { method: 'POST' });
}

export function updateUserPreferences(
  preferences: Partial<Omit<UserPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<{ preferences: UserPreferences; message: string }> {
  return apiFetch('/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
}

export function deleteUserPreferences(): Promise<{ message: string }> {
  return apiFetch('/preferences', { method: 'DELETE' });
}

// Material Generation
export function generateResume(
  jobId: string,
  options?: { tone?: 'formal' | 'professional' | 'enthusiastic' }
): Promise<{ material: GeneratedMaterial; message: string }> {
  return apiFetch(`/generate/resume/${jobId}`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export function generateCoverLetter(
  jobId: string,
  options?: { tone?: 'formal' | 'professional' | 'enthusiastic' }
): Promise<{ material: GeneratedMaterial; message: string }> {
  return apiFetch(`/generate/cover-letter/${jobId}`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export function fetchJobMaterials(jobId: string): Promise<{ materials: GeneratedMaterial[] }> {
  return apiFetch(`/generate/${jobId}/materials`, { method: 'GET' });
}

export function fetchMaterial(id: string): Promise<{ material: GeneratedMaterial }> {
  return apiFetch(`/generate/${id}`, { method: 'GET' });
}

export function updateMaterial(id: string, content: string): Promise<{ material: GeneratedMaterial; message: string }> {
  return apiFetch(`/generate/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export function deleteMaterial(id: string): Promise<{ message: string }> {
  return apiFetch(`/generate/${id}`, { method: 'DELETE' });
}
