-- Migration 006: CV upload support
-- Adds cv_url to candidates and creates the resumes storage bucket.
-- Run in Supabase SQL editor.

-- 1. Add cv_url column to candidates
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_url TEXT;

-- 2. Create resumes bucket (PDF only, 10 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: recruiters can only access their own folder
--    Path structure: {recruiter_id}/{candidate_id}/{filename}

CREATE POLICY "Recruiters upload own resumes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Recruiters read own resumes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Recruiters update own resumes"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Recruiters delete own resumes"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
