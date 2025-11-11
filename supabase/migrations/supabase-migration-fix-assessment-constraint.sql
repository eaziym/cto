-- Migration: Fix job_assessments unique constraint
-- Now that we use unified knowledge_base_summary instead of individual resume_analysis_id,
-- we need to update the constraint to allow one assessment per user-job pair

-- Drop the old constraint
ALTER TABLE job_assessments 
DROP CONSTRAINT IF EXISTS job_assessments_user_id_job_external_id_resume_analysis_id_key;

-- Add new constraint without resume_analysis_id
-- This allows one assessment per user-job combination
ALTER TABLE job_assessments
ADD CONSTRAINT job_assessments_user_id_job_external_id_key 
UNIQUE(user_id, job_external_id);

-- Comment explaining the change
COMMENT ON CONSTRAINT job_assessments_user_id_job_external_id_key ON job_assessments 
IS 'Ensures one assessment per user-job combination. Uses unified knowledge base instead of specific resume versions.';
