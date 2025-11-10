-- ============================================================================
-- KNOWLEDGE BASE TRANSFORMATION MIGRATION
-- Migrates from resume-based to knowledge base-driven platform
-- Date: November 9, 2025
-- ============================================================================

-- ============================================================================
-- 1. CREATE NEW TABLES
-- ============================================================================

-- Knowledge Sources Table
-- Stores various sources of user information (resume, LinkedIn, GitHub, etc.)
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source metadata
  source_type TEXT NOT NULL CHECK (source_type IN (
    'resume',
    'linkedin',
    'github',
    'personal_website',
    'project_document',
    'portfolio',
    'other_document',
    'manual_text'
  )),
  source_identifier TEXT, -- URL or filename
  
  -- Content
  raw_content JSONB, -- Original data from source (e.g., LinkedIn API response)
  parsed_data JSONB NOT NULL, -- Normalized to resume-like format
  metadata JSONB, -- Additional info (file size, scrape date, processing time, etc.)
  
  -- Status
  processing_status TEXT DEFAULT 'completed' CHECK (processing_status IN (
    'pending',
    'processing',
    'completed',
    'failed'
  )),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for knowledge_sources
CREATE INDEX idx_knowledge_sources_user_id ON knowledge_sources(user_id);
CREATE INDEX idx_knowledge_sources_type ON knowledge_sources(user_id, source_type);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(processing_status) WHERE processing_status != 'completed';

-- Enable RLS
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own knowledge sources"
  ON knowledge_sources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own knowledge sources"
  ON knowledge_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own knowledge sources"
  ON knowledge_sources FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own knowledge sources"
  ON knowledge_sources FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- User Preferences Table
-- Stores AI-predicted and user-confirmed preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- AI-predicted preferences (arrays with confidence scores)
  predicted_industries JSONB, -- [{ "name": "Tech", "confidence": 0.95 }, ...]
  predicted_roles JSONB, -- [{ "name": "Software Engineer", "confidence": 0.92 }, ...]
  predicted_companies JSONB, -- [{ "name": "Google", "confidence": 0.85 }, ...]
  
  -- User-confirmed preferences (multi-select)
  confirmed_industries TEXT[], -- ['Tech', 'AI', 'FinTech']
  confirmed_roles TEXT[], -- ['Software Engineer', 'Product Manager']
  confirmed_companies TEXT[], -- ['Google', 'Stripe']
  
  -- Free-form "Other" options
  other_industries TEXT,
  other_roles TEXT,
  other_companies TEXT,
  
  -- Additional context
  additional_context TEXT, -- User's manual input from textarea
  
  -- Metadata
  prediction_metadata JSONB, -- Model version, parameters, etc.
  last_predicted_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one preferences record per user
  UNIQUE(user_id)
);

-- Indexes for user_preferences
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_industries ON user_preferences USING GIN (confirmed_industries);
CREATE INDEX idx_user_preferences_roles ON user_preferences USING GIN (confirmed_roles);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- Generated Materials Table
-- Stores AI-generated resumes and cover letters
-- ============================================================================

CREATE TABLE IF NOT EXISTS generated_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_external_id TEXT NOT NULL, -- From external jobs API
  
  -- Material info
  material_type TEXT NOT NULL CHECK (material_type IN ('resume', 'cover_letter')),
  content TEXT NOT NULL, -- Markdown or DOCX-compatible format
  format TEXT DEFAULT 'markdown' CHECK (format IN ('markdown', 'docx', 'html')),
  
  -- Source data snapshots (for regeneration/debugging)
  knowledge_base_snapshot JSONB, -- What data was used to generate
  job_description_snapshot JSONB, -- JD at time of generation
  generation_metadata JSONB, -- Model, prompt version, etc.
  
  -- User modifications
  user_edited BOOLEAN DEFAULT FALSE,
  edit_count INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'superseded')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for generated_materials
CREATE INDEX idx_generated_materials_user_job ON generated_materials(user_id, job_external_id);
CREATE INDEX idx_generated_materials_type ON generated_materials(material_type);
CREATE INDEX idx_generated_materials_status ON generated_materials(status) WHERE status = 'active';

-- Enable RLS
ALTER TABLE generated_materials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own materials"
  ON generated_materials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create materials"
  ON generated_materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own materials"
  ON generated_materials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own materials"
  ON generated_materials FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 2. MODIFY EXISTING TABLES
-- ============================================================================

-- Update profiles table
-- Remove COMPASS-centric columns, add knowledge base summary
ALTER TABLE profiles
  DROP COLUMN IF EXISTS latest_compass_score,
  DROP COLUMN IF EXISTS latest_compass_verdict,
  DROP COLUMN IF EXISTS latest_compass_breakdown,
  DROP COLUMN IF EXISTS latest_compass_calculated_at;

-- Add new columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS knowledge_base_summary JSONB, -- Aggregated from all sources
  ADD COLUMN IF NOT EXISTS knowledge_base_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1 CHECK (onboarding_step >= 1 AND onboarding_step <= 5);

-- Add comment
COMMENT ON COLUMN profiles.knowledge_base_summary IS 'Aggregated data from all knowledge sources (skills, experience, education, etc.)';
COMMENT ON COLUMN profiles.onboarding_step IS 'Current onboarding step: 1=Basic Info, 2=Knowledge Base, 3=Preferences, 4=Review, 5=Complete';

-- Update applications table
-- Add HR contact tracking and material links
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS hr_contacted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hr_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS hr_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS hr_contact_title TEXT,
  ADD COLUMN IF NOT EXISTS hr_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_message TEXT,
  
  -- Link to generated materials
  ADD COLUMN IF NOT EXISTS resume_id UUID REFERENCES generated_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_letter_id UUID REFERENCES generated_materials(id) ON DELETE SET NULL;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_applications_hr_contacted ON applications(hr_contacted) WHERE hr_contacted = TRUE;
CREATE INDEX IF NOT EXISTS idx_applications_materials ON applications(resume_id, cover_letter_id) WHERE resume_id IS NOT NULL OR cover_letter_id IS NOT NULL;

-- Update saved_jobs table
-- Make COMPASS score optional (not auto-calculated)
ALTER TABLE saved_jobs
  RENAME COLUMN compass_score TO compass_score_cached;

ALTER TABLE saved_jobs
  ALTER COLUMN compass_score_cached DROP NOT NULL;

-- Add preference-based match info
ALTER TABLE saved_jobs
  ADD COLUMN IF NOT EXISTS match_reason JSONB, -- { industries: [...], roles: [...], skills: [...] }
  ADD COLUMN IF NOT EXISTS relevance_score FLOAT CHECK (relevance_score >= 0 AND relevance_score <= 1);

-- Add index for relevance score
CREATE INDEX IF NOT EXISTS idx_saved_jobs_relevance ON saved_jobs(user_id, relevance_score DESC NULLS LAST);

-- Add comment
COMMENT ON COLUMN saved_jobs.compass_score_cached IS 'DEPRECATED: COMPASS score (now optional, calculated on-demand)';
COMMENT ON COLUMN saved_jobs.match_reason IS 'Why this job matches (industries, roles, skills)';
COMMENT ON COLUMN saved_jobs.relevance_score IS 'Preference-based relevance (0-1)';

-- ============================================================================
-- 3. DATA MIGRATION
-- ============================================================================

-- Migrate existing resume analyses to knowledge sources
INSERT INTO knowledge_sources (user_id, source_type, source_identifier, parsed_data, metadata, created_at)
SELECT 
  user_id,
  'resume' AS source_type,
  file_name AS source_identifier,
  parsed_data,
  jsonb_build_object(
    'file_size', file_size,
    'mime_type', mime_type,
    'processing_time_ms', processing_time_ms,
    'migrated_from', 'resume_analyses'
  ) AS metadata,
  created_at
FROM resume_analyses
WHERE NOT EXISTS (
  -- Avoid duplicates if migration is run multiple times
  SELECT 1 FROM knowledge_sources ks
  WHERE ks.user_id = resume_analyses.user_id
  AND ks.source_type = 'resume'
  AND ks.source_identifier = resume_analyses.file_name
);

-- ============================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to update knowledge_base_summary when sources change
CREATE OR REPLACE FUNCTION update_knowledge_base_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Aggregate all knowledge sources for the user
  UPDATE profiles
  SET 
    knowledge_base_summary = (
      SELECT jsonb_agg(parsed_data)
      FROM knowledge_sources
      WHERE user_id = NEW.user_id
      AND processing_status = 'completed'
    ),
    knowledge_base_updated_at = NOW()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update knowledge_base_summary
DROP TRIGGER IF EXISTS trigger_update_knowledge_base_summary ON knowledge_sources;
CREATE TRIGGER trigger_update_knowledge_base_summary
  AFTER INSERT OR UPDATE OR DELETE ON knowledge_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_base_summary();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_knowledge_sources_updated_at ON knowledge_sources;
CREATE TRIGGER trigger_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER trigger_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_generated_materials_updated_at ON generated_materials;
CREATE TRIGGER trigger_generated_materials_updated_at
  BEFORE UPDATE ON generated_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. UTILITY VIEWS
-- ============================================================================

-- View for complete user knowledge base
CREATE OR REPLACE VIEW user_knowledge_base_view AS
SELECT 
  p.id AS user_id,
  p.name,
  au.email,
  p.knowledge_base_summary,
  p.knowledge_base_updated_at,
  jsonb_agg(
    jsonb_build_object(
      'id', ks.id,
      'source_type', ks.source_type,
      'source_identifier', ks.source_identifier,
      'parsed_data', ks.parsed_data,
      'created_at', ks.created_at
    )
  ) FILTER (WHERE ks.id IS NOT NULL) AS sources,
  up.confirmed_industries,
  up.confirmed_roles,
  up.confirmed_companies,
  up.additional_context
FROM profiles p
LEFT JOIN auth.users au ON p.id = au.id
LEFT JOIN knowledge_sources ks ON p.id = ks.user_id AND ks.processing_status = 'completed'
LEFT JOIN user_preferences up ON p.id = up.user_id
GROUP BY p.id, p.name, au.email, p.knowledge_base_summary, p.knowledge_base_updated_at,
         up.confirmed_industries, up.confirmed_roles, up.confirmed_companies, up.additional_context;

-- View for user applications with materials
CREATE OR REPLACE VIEW applications_with_materials_view AS
SELECT 
  a.*,
  r.content AS resume_content,
  r.format AS resume_format,
  r.user_edited AS resume_edited,
  c.content AS cover_letter_content,
  c.format AS cover_letter_format,
  c.user_edited AS cover_letter_edited
FROM applications a
LEFT JOIN generated_materials r ON a.resume_id = r.id
LEFT JOIN generated_materials c ON a.cover_letter_id = c.id;

-- ============================================================================
-- 6. CLEANUP (Optional - for rollback)
-- ============================================================================

-- Function to rollback migration (use with caution)
CREATE OR REPLACE FUNCTION rollback_knowledge_base_migration()
RETURNS void AS $$
BEGIN
  -- Restore COMPASS columns to profiles
  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS latest_compass_score INTEGER,
    ADD COLUMN IF NOT EXISTS latest_compass_verdict TEXT,
    ADD COLUMN IF NOT EXISTS latest_compass_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS latest_compass_calculated_at TIMESTAMPTZ;
  
  -- Remove new columns
  ALTER TABLE profiles
    DROP COLUMN IF EXISTS knowledge_base_summary,
    DROP COLUMN IF EXISTS knowledge_base_updated_at,
    DROP COLUMN IF EXISTS onboarding_completed,
    DROP COLUMN IF EXISTS onboarding_step;
  
  -- Restore saved_jobs
  ALTER TABLE saved_jobs
    RENAME COLUMN compass_score_cached TO compass_score;
  
  -- Remove new tables (destructive!)
  -- DROP TABLE IF EXISTS generated_materials CASCADE;
  -- DROP TABLE IF EXISTS user_preferences CASCADE;
  -- DROP TABLE IF EXISTS knowledge_sources CASCADE;
  
  RAISE NOTICE 'Rollback completed. Note: New tables are NOT dropped to preserve data.';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. GRANTS (if needed for service roles)
-- ============================================================================

-- Grant access to service role (adjust as needed)
-- GRANT ALL ON knowledge_sources TO service_role;
-- GRANT ALL ON user_preferences TO service_role;
-- GRANT ALL ON generated_materials TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE 'Knowledge Base Migration Complete!';
  RAISE NOTICE 'New tables created: knowledge_sources, user_preferences, generated_materials';
  RAISE NOTICE 'Profiles table updated: COMPASS columns removed, knowledge_base_summary added';
  RAISE NOTICE 'Applications table updated: HR tracking added';
  RAISE NOTICE 'Saved_jobs table updated: COMPASS score made optional';
  RAISE NOTICE 'Resume analyses migrated to knowledge_sources';
END $$;
