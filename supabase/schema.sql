-- Supabase Database Schema for CTO (Chief Talent Officer)
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. PROFILES TABLE
-- Stores user profile information (extends auth.users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  gender TEXT,
  nationality TEXT,
  education_level TEXT CHECK (education_level IN ('Diploma', 'Bachelors', 'Masters', 'PhD')),
  education_institution TEXT,
  certifications TEXT[], -- Array of certification names
  years_experience INTEGER CHECK (years_experience >= 0),
  skills TEXT[], -- Array of skill names
  expected_salary_sgd INTEGER CHECK (expected_salary_sgd > 0),
  plan TEXT CHECK (plan IN ('freemium', 'standard', 'pro', 'ultimate')) DEFAULT 'freemium',
  -- Latest COMPASS score (denormalized for quick access)
  latest_compass_score INTEGER CHECK (latest_compass_score >= 0 AND latest_compass_score <= 110),
  latest_compass_verdict TEXT CHECK (latest_compass_verdict IN ('Likely', 'Borderline', 'Unlikely')),
  latest_compass_breakdown JSONB,
  latest_compass_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(id);

-- ============================================================================
-- 2. SAVED JOBS TABLE
-- Caches job-user match scores for performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_external_id TEXT NOT NULL, -- ID from external API
  job_title TEXT NOT NULL,
  job_company TEXT NOT NULL,
  job_url TEXT,
  job_location TEXT,
  job_date TEXT,
  job_tags TEXT[],
  compass_score INTEGER CHECK (compass_score >= 0 AND compass_score <= 100),
  ep_verdict TEXT CHECK (ep_verdict IN ('Likely', 'Borderline', 'Unlikely')),
  score_breakdown JSONB, -- Cached detailed breakdown
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one cache entry per user-job combination
  UNIQUE(user_id, job_external_id)
);

-- Enable Row Level Security
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for saved_jobs
CREATE POLICY "Users can view their saved jobs"
  ON saved_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save jobs"
  ON saved_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their saved jobs"
  ON saved_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved jobs"
  ON saved_jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id ON saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_external_id ON saved_jobs(job_external_id);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_created_at ON saved_jobs(created_at DESC);

-- ============================================================================
-- 3. APPLICATIONS TABLE
-- Tracks user job applications
-- ============================================================================

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_external_id TEXT NOT NULL, -- From external API
  job_title TEXT NOT NULL,
  job_company TEXT NOT NULL,
  job_url TEXT,
  status TEXT CHECK (status IN ('draft', 'sent', 'responded', 'rejected', 'interview', 'offer')) DEFAULT 'draft',
  notes TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for applications
CREATE POLICY "Users can view their applications"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their applications"
  ON applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their applications"
  ON applications FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

-- ============================================================================
-- 4. RESUME ANALYSES TABLE
-- Stores history of resume uploads and parsing results
-- ============================================================================

CREATE TABLE IF NOT EXISTS resume_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  parsed_data JSONB NOT NULL, -- Full extracted profile data
  processing_time_ms INTEGER, -- How long parsing took
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE resume_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for resume_analyses
CREATE POLICY "Users can view their resume analyses"
  ON resume_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create resume analyses"
  ON resume_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_resume_analyses_user_id ON resume_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_analyses_created_at ON resume_analyses(created_at DESC);

-- ============================================================================
-- 5. COMPASS SCORES TABLE
-- History of all COMPASS score calculations
-- ============================================================================

CREATE TABLE IF NOT EXISTS compass_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_snapshot JSONB NOT NULL, -- The profile data used for this calculation
  total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 110),
  verdict TEXT NOT NULL CHECK (verdict IN ('Likely', 'Borderline', 'Unlikely')),
  breakdown JSONB NOT NULL, -- { salary, qualifications, diversity, support, skills, strategic }
  notes JSONB, -- Array of explanation notes from LLM
  job_context JSONB, -- Optional: if this was calculated against a specific job
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE compass_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for compass_scores
CREATE POLICY "Users can view their compass scores"
  ON compass_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create compass scores"
  ON compass_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_compass_scores_user_id ON compass_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_compass_scores_created_at ON compass_scores(created_at DESC);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles table
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for applications table
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. INITIAL DATA / DEMO SETUP (Optional)
-- ============================================================================

-- You can add demo data here if needed for testing
-- Example:
-- INSERT INTO profiles (id, name, education_level, skills, plan)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   'Demo User',
--   'Bachelors',
--   ARRAY['TypeScript', 'React', 'Node.js'],
--   'pro'
-- );

-- ============================================================================
-- DONE! Tables created with RLS enabled.
-- Remember to set SUPABASE_SERVICE_ROLE_KEY in your backend .env
-- ============================================================================
