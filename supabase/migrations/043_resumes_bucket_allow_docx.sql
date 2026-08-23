-- Migration 043: allow .docx in the "resumes" storage bucket
-- Previously PDF-only, which silently broke JD (and any) Word doc uploads with a
-- 415 the app never surfaced. Broadened to also allow Word docs so JD previews can
-- store and reopen the original file, matching PDF behavior.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE name = 'resumes';
