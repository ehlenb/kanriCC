-- ── prospects: new table (Wave 6 piece 5) ─────────────────────────────────────
-- Agency-side BD pipeline: target companies before they are clients. Separate
-- table from `clients` rather than a shared type-flagged row, since `clients`
-- carries contract-specific columns (kk_entity, fee_pct, contract_signed) that
-- don't apply pre-signature, and separate tables keep RLS and the UI simpler.
-- Team-visible like clients (all team members see all prospects), not
-- recruiter-private like priority_action_state — mirrors the clients RLS
-- pattern exactly. Follows the Section 5 "new table checklist": team_id
-- default + index from the start, no repeat of the migration-052 gap.

CREATE TABLE public.prospects (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid        NOT NULL DEFAULT public.current_team_id() REFERENCES public.teams(id),
  owner_recruiter_id    uuid        NOT NULL REFERENCES public.recruiters(id),
  company_name          text        NOT NULL,
  industry              text,
  website               text,
  stage                 text        NOT NULL DEFAULT 'Identified'
                                     CHECK (stage IN ('Identified', 'Researched', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost')),
  source                text,
  notes                 text,  -- recruiter observation only, AI never writes here (same rule as client_contacts.notes)
  research_notes        text,  -- AI-written, from web research (same rule as clients.strategy_notes)
  bd_trigger_notes       text,  -- AI-written BD signal summary (funding/expansion/exec-hire), recruiter-reviewed before acted on
  last_contacted_at      date,
  converted_to_client_id uuid       REFERENCES public.clients(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_team_id ON public.prospects(team_id);
CREATE INDEX idx_prospects_owner_recruiter_id ON public.prospects(owner_recruiter_id);
CREATE INDEX idx_prospects_converted_to_client_id ON public.prospects(converted_to_client_id);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_select" ON public.prospects FOR SELECT USING (team_id = public.current_team_id());
CREATE POLICY "prospects_insert" ON public.prospects FOR INSERT WITH CHECK (team_id = public.current_team_id());
CREATE POLICY "prospects_update" ON public.prospects FOR UPDATE USING (team_id = public.current_team_id());
CREATE POLICY "prospects_delete" ON public.prospects FOR DELETE USING (team_id = public.current_team_id());
