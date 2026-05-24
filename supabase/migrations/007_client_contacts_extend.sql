-- Migration 007: Extend client_contacts with missing columns
-- The table existed before migration 002 with a minimal schema.
-- This adds the columns the app needs.
-- Run in Supabase SQL editor.

ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS recruiter_id      UUID REFERENCES recruiters(id),
  ADD COLUMN IF NOT EXISTS role              TEXT
    CHECK (role IN ('hiring_manager', 'hr_gatekeeper', 'ta_coordinator', 'executive', 'other')),
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS relationship_score INTEGER
    CHECK (relationship_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS bypass_hr_warning  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_primary_contact BOOLEAN NOT NULL DEFAULT false;

-- Backfill recruiter_id from the parent client (for any existing rows)
UPDATE client_contacts cc
SET recruiter_id = c.recruiter_id
FROM clients c
WHERE cc.client_id = c.id
  AND cc.recruiter_id IS NULL;

-- Enable RLS if not already on
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

-- Replace or add the recruiter-scoped policy
DROP POLICY IF EXISTS "recruiter_own_client_contacts" ON client_contacts;
CREATE POLICY "recruiter_own_client_contacts" ON client_contacts
  FOR ALL USING (
    auth.uid() = recruiter_id
    OR auth.uid() = (
      SELECT c.recruiter_id FROM clients c WHERE c.id = client_id
    )
  );
