-- ── clients: extend existing table ────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('prospect', 'active', 'inactive')),
  ADD COLUMN IF NOT EXISTS employee_japanese_pct int,
  ADD COLUMN IF NOT EXISTS contract_signed bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_url text,
  ADD COLUMN IF NOT EXISTS ai_context text,
  ADD COLUMN IF NOT EXISTS ai_context_updated_at timestamptz;

-- ── requisitions: extend existing table ───────────────────────────────────────

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS jd_url text,
  ADD COLUMN IF NOT EXISTS jd_text text,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'standard'
    CHECK (urgency IN ('standard', 'urgent', 'backburner')),
  ADD COLUMN IF NOT EXISTS interview_steps int,
  ADD COLUMN IF NOT EXISTS interview_notes text,
  ADD COLUMN IF NOT EXISTS ai_context text,
  ADD COLUMN IF NOT EXISTS ai_context_updated_at timestamptz;

-- ── requisition_conditions: new table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS requisition_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  condition_text text NOT NULL,
  condition_type text NOT NULL CHECK (condition_type IN ('must_have', 'nice_to_have')),
  source text NOT NULL CHECK (source IN ('jd', 'client')),
  priority_rank int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE requisition_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rc_select" ON requisition_conditions FOR SELECT
  USING (EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_id AND r.recruiter_id = auth.uid()));
CREATE POLICY "rc_insert" ON requisition_conditions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_id AND r.recruiter_id = auth.uid()));
CREATE POLICY "rc_update" ON requisition_conditions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_id AND r.recruiter_id = auth.uid()));
CREATE POLICY "rc_delete" ON requisition_conditions FOR DELETE
  USING (EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_id AND r.recruiter_id = auth.uid()));

-- ── candidates: extend existing table ─────────────────────────────────────────

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS additional_languages text,
  ADD COLUMN IF NOT EXISTS availability_date date,
  ADD COLUMN IF NOT EXISTS candidate_status text NOT NULL DEFAULT 'active'
    CHECK (candidate_status IN ('active', 'passive', 'placed', 'off_market')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'other'
    CHECK (source IN ('linkedin', 'bizreach', 'doda', 'referral', 'inbound', 'other')),
  ADD COLUMN IF NOT EXISTS registration_form_url text,
  ADD COLUMN IF NOT EXISTS ai_context text,
  ADD COLUMN IF NOT EXISTS ai_context_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS placement_guarantee_until date;

-- ── candidate_motivations: add motivation_type ────────────────────────────────

ALTER TABLE candidate_motivations
  ADD COLUMN IF NOT EXISTS motivation_type text
    CHECK (motivation_type IN (
      'salary', 'career_progression', 'international_environment',
      'wlb', 'stability', 'brand', 'remote', 'leadership', 'other'
    ));

-- ── competing_interviews: add is_active ───────────────────────────────────────

ALTER TABLE competing_interviews
  ADD COLUMN IF NOT EXISTS is_active bool NOT NULL DEFAULT true;

-- ── processes: extend existing table ─────────────────────────────────────────

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS buy_in_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cv_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_amount int,
  ADD COLUMN IF NOT EXISTS offer_date timestamptz,
  ADD COLUMN IF NOT EXISTS placed_date date,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS ai_snapshot_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- ── interactions: extend existing table ───────────────────────────────────────

ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES requisitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS process_id uuid REFERENCES processes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction text CHECK (direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS transcript_raw text,
  ADD COLUMN IF NOT EXISTS triggers_context_refresh bool NOT NULL DEFAULT true;

-- ── ai_context_log: new table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_context_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('candidate', 'client', 'requisition')),
  entity_id uuid NOT NULL,
  triggered_by_interaction_id uuid,
  tokens_used int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_context_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acl_select" ON ai_context_log FOR SELECT USING (auth.uid() = recruiter_id);
CREATE POLICY "acl_insert" ON ai_context_log FOR INSERT WITH CHECK (auth.uid() = recruiter_id);

-- ── client_contacts: add contact fields ───────────────────────────────────────

ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS linkedin_url text;
