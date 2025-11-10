-- Migration: Add COMPASS score persistence
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- 1. Add compass score fields to profiles table
-- ============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS latest_compass_score INTEGER CHECK (latest_compass_score >= 0 AND latest_compass_score <= 110),
ADD COLUMN IF NOT EXISTS latest_compass_verdict TEXT CHECK (latest_compass_verdict IN ('Likely', 'Borderline', 'Unlikely')),
ADD COLUMN IF NOT EXISTS latest_compass_breakdown JSONB,
ADD COLUMN IF NOT EXISTS latest_compass_calculated_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Create compass_scores history table
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
-- DONE! Run this migration once to add COMPASS score persistence
-- ============================================================================
