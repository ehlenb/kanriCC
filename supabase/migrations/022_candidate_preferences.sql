-- 022_candidate_preferences.sql
-- Industry and location preference fields for candidates

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS industry_preferences text,
  ADD COLUMN IF NOT EXISTS location_preferences text;
