-- Migration: Add job_assessments and hr_contacts_cache tables
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- JOB ASSESSMENTS TABLE
-- Stores detailed LLM-powered job fit assessments
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_external_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_company TEXT NOT NULL,
  resume_analysis_id UUID REFERENCES resume_analyses(id) ON DELETE SET NULL,
  
  -- Assessment results (from LLM scorer)
  candidate_name TEXT,
  candidate_email TEXT,
  role_title TEXT,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  must_have_coverage DECIMAL(3,2) CHECK (must_have_coverage >= 0 AND must_have_coverage <= 1),
  subscores JSONB NOT NULL,
  decision TEXT CHECK (decision IN ('strong_match', 'possible_match', 'weak_match', 'reject')),
  evidence JSONB NOT NULL,
  gaps JSONB NOT NULL,
  questions_for_interview JSONB,
  recommendations_to_candidate JSONB,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One assessment per user-job-resume combination (latest wins)
  UNIQUE(user_id, job_external_id, resume_analysis_id)
);

-- Enable Row Level Security
ALTER TABLE job_assessments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their job assessments"
  ON job_assessments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create job assessments"
  ON job_assessments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their job assessments"
  ON job_assessments FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_assessments_user_id ON job_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_job_assessments_job_id ON job_assessments(job_external_id);
CREATE INDEX IF NOT EXISTS idx_job_assessments_created_at ON job_assessments(created_at DESC);

-- ============================================================================
-- HR CONTACTS CACHE TABLE
-- Caches HR contact searches by company domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS hr_contacts_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_domain TEXT NOT NULL,
  company_name TEXT,
  
  -- Cached HR prospects (array of contact objects)
  prospects JSONB NOT NULL,
  
  -- Search metadata
  fetched_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  search_count INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One cache entry per company domain
  UNIQUE(company_domain)
);

-- Enable Row Level Security
ALTER TABLE hr_contacts_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies - All authenticated users can read cached HR contacts
CREATE POLICY "Authenticated users can view HR contacts cache"
  ON hr_contacts_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create HR contacts cache"
  ON hr_contacts_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update HR contacts cache"
  ON hr_contacts_cache FOR UPDATE
  TO authenticated
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hr_contacts_company_domain ON hr_contacts_cache(company_domain);
CREATE INDEX IF NOT EXISTS idx_hr_contacts_created_at ON hr_contacts_cache(created_at DESC);

-- Trigger for hr_contacts_cache updated_at
CREATE TRIGGER update_hr_contacts_cache_updated_at
  BEFORE UPDATE ON hr_contacts_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HR OUTREACH MESSAGES TABLE (optional - for saving drafted messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS hr_outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_external_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_company TEXT NOT NULL,
  hr_contact_name TEXT,
  hr_contact_email TEXT,
  
  -- Generated message
  message_subject TEXT,
  message_body TEXT NOT NULL,
  
  -- Status tracking
  was_sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE hr_outreach_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their outreach messages"
  ON hr_outreach_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create outreach messages"
  ON hr_outreach_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their outreach messages"
  ON hr_outreach_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their outreach messages"
  ON hr_outreach_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hr_outreach_user_id ON hr_outreach_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_outreach_created_at ON hr_outreach_messages(created_at DESC);

-- Trigger for hr_outreach_messages updated_at
CREATE TRIGGER update_hr_outreach_messages_updated_at
  BEFORE UPDATE ON hr_outreach_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
