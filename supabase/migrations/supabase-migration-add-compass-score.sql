-- Migration: Add compass_score field to job_assessments table
-- This stores the recalculated COMPASS score based on the detailed JD

ALTER TABLE job_assessments 
ADD COLUMN IF NOT EXISTS compass_score JSONB;

COMMENT ON COLUMN job_assessments.compass_score IS 'Recalculated COMPASS score using LLM with detailed job description. Structure: { total, breakdown: { salary, qualifications, diversity, support, skills, strategic }, verdict, notes }';
