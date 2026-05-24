-- ──────────────────────────────────────────────────────────────────────────────
-- 002: Client contacts table + extended clients / requisitions / interactions
-- Run in Supabase SQL editor after 001_full_schema.sql
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Add new columns to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_url                TEXT,
  ADD COLUMN IF NOT EXISTS is_active               BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fee_pct                 INTEGER,
  ADD COLUMN IF NOT EXISTS started_at              DATE,
  ADD COLUMN IF NOT EXISTS japan_role_in_group     TEXT
    CHECK (japan_role_in_group IN ('Core market', 'Growth market', 'Satellite office')),
  ADD COLUMN IF NOT EXISTS kk_entity               BOOLEAN;

-- 2. Create client_contacts table
CREATE TABLE IF NOT EXISTS client_contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recruiter_id         UUID NOT NULL REFERENCES recruiters(id),
  name                 TEXT NOT NULL,
  role                 TEXT NOT NULL
    CHECK (role IN ('hiring_manager', 'hr_gatekeeper', 'ta_coordinator', 'executive', 'other')),
  title                TEXT,
  notes                TEXT,                           -- recruiter observation only, AI never writes here
  relationship_score   INTEGER CHECK (relationship_score BETWEEN 1 AND 5),
  bypass_hr_warning    BOOLEAN DEFAULT false,
  is_primary_contact   BOOLEAN DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruiter_own_client_contacts" ON client_contacts
  FOR ALL USING (auth.uid() = recruiter_id);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id
  ON client_contacts(client_id);

-- 3. Add new columns to requisitions
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS hiring_manager_id UUID REFERENCES client_contacts(id),
  ADD COLUMN IF NOT EXISTS is_backfill       BOOLEAN DEFAULT false;

-- 4. Extend interaction_type to include client-side event types
--    (Drop existing CHECK constraint and recreate with expanded values)
ALTER TABLE interactions
  DROP CONSTRAINT IF EXISTS interactions_interaction_type_check;

ALTER TABLE interactions
  ADD CONSTRAINT interactions_interaction_type_check
  CHECK (interaction_type IN (
    'call', 'email', 'meeting', 'note',
    'cv_submitted', 'interview', 'risk_flag'
  ));
