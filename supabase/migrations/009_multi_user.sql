-- ═══════════════════════════════════════════════════════════════════════════════
-- 009_multi_user.sql — Team-scoped multi-user architecture
--
-- What this does:
--   1. Creates the teams table (one row per agency)
--   2. Adds team_id to recruiters + all data tables
--   3. Bootstraps existing single-recruiter data (each recruiter gets their own team)
--   4. Replaces all recruiter_id-based RLS with team_id-based RLS
--   5. Adds triggers so team_id is auto-populated on insert (frontend needs no change)
--   6. Updates handle_new_user to create a team for each new signup
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. teams table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ─── 2. Add team_id to recruiters ────────────────────────────────────────────

ALTER TABLE public.recruiters ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

-- ─── 3. Bootstrap: create a team per existing recruiter ───────────────────────
-- We reuse the recruiter's UUID as the team UUID. This makes backfilling trivial
-- (team_id = recruiter_id for all existing rows). When a second recruiter joins
-- an agency, an admin updates their team_id to match the agency owner's team.

INSERT INTO public.teams (id, name, created_at)
SELECT
  r.id,
  COALESCE(r.agency_name, r.full_name, split_part(r.email, '@', 1) || '''s Team'),
  r.created_at
FROM public.recruiters r
ON CONFLICT (id) DO NOTHING;

UPDATE public.recruiters SET team_id = id WHERE team_id IS NULL;
ALTER TABLE public.recruiters ALTER COLUMN team_id SET NOT NULL;

-- ─── helper: stable function to get the current user's team_id ────────────────
-- Created after team_id column exists on recruiters.
CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT team_id FROM public.recruiters WHERE id = auth.uid() LIMIT 1
$$;

-- teams RLS now that current_team_id() exists
CREATE POLICY "teams_select" ON public.teams FOR SELECT
  USING (id = public.current_team_id());

-- ─── 4. Update recruiters RLS — all team members can read each other ──────────

DROP POLICY IF EXISTS "recruiter_select" ON public.recruiters;
CREATE POLICY "recruiter_select" ON public.recruiters FOR SELECT
  USING (id = auth.uid() OR team_id = public.current_team_id());
-- INSERT and UPDATE policies stay as-is (own row only)

-- ─── 5. Add team_id to all main data tables ───────────────────────────────────

ALTER TABLE public.candidates   ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.clients      ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.processes    ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

-- ─── 6. Backfill — team_id = recruiter_id works because team.id = recruiter.id ─

UPDATE public.candidates   SET team_id = recruiter_id       WHERE team_id IS NULL;
UPDATE public.clients      SET team_id = recruiter_id       WHERE team_id IS NULL;
UPDATE public.requisitions SET team_id = recruiter_id       WHERE team_id IS NULL;
UPDATE public.processes    SET team_id = owner_recruiter_id WHERE team_id IS NULL;
UPDATE public.interactions SET team_id = recruiter_id       WHERE team_id IS NULL;

ALTER TABLE public.candidates   ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE public.clients      ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE public.requisitions ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE public.processes    ALTER COLUMN team_id SET NOT NULL;

-- ─── 7. Auto-populate team_id on INSERT via trigger ───────────────────────────
-- This means the frontend never needs to pass team_id explicitly.

CREATE OR REPLACE FUNCTION public.set_team_id_from_recruiter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    NEW.team_id := public.current_team_id();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER candidates_set_team_id
  BEFORE INSERT ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();

CREATE TRIGGER clients_set_team_id
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();

CREATE TRIGGER requisitions_set_team_id
  BEFORE INSERT ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();

CREATE TRIGGER processes_set_team_id
  BEFORE INSERT ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();

CREATE TRIGGER interactions_set_team_id
  BEFORE INSERT ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();

-- ─── 8. Replace all RLS policies with team-scoped versions ───────────────────

-- candidates
DROP POLICY IF EXISTS "cand_select" ON public.candidates;
DROP POLICY IF EXISTS "cand_insert" ON public.candidates;
DROP POLICY IF EXISTS "cand_update" ON public.candidates;
DROP POLICY IF EXISTS "cand_delete" ON public.candidates;
CREATE POLICY "cand_select" ON public.candidates FOR SELECT USING (team_id = public.current_team_id());
CREATE POLICY "cand_insert" ON public.candidates FOR INSERT WITH CHECK (team_id = public.current_team_id());
CREATE POLICY "cand_update" ON public.candidates FOR UPDATE USING (team_id = public.current_team_id());
CREATE POLICY "cand_delete" ON public.candidates FOR DELETE USING (team_id = public.current_team_id());

-- clients
DROP POLICY IF EXISTS "cli_select" ON public.clients;
DROP POLICY IF EXISTS "cli_insert" ON public.clients;
DROP POLICY IF EXISTS "cli_update" ON public.clients;
DROP POLICY IF EXISTS "cli_delete" ON public.clients;
CREATE POLICY "cli_select" ON public.clients FOR SELECT USING (team_id = public.current_team_id());
CREATE POLICY "cli_insert" ON public.clients FOR INSERT WITH CHECK (team_id = public.current_team_id());
CREATE POLICY "cli_update" ON public.clients FOR UPDATE USING (team_id = public.current_team_id());
CREATE POLICY "cli_delete" ON public.clients FOR DELETE USING (team_id = public.current_team_id());

-- requisitions
DROP POLICY IF EXISTS "req_select" ON public.requisitions;
DROP POLICY IF EXISTS "req_insert" ON public.requisitions;
DROP POLICY IF EXISTS "req_update" ON public.requisitions;
DROP POLICY IF EXISTS "req_delete" ON public.requisitions;
CREATE POLICY "req_select" ON public.requisitions FOR SELECT USING (team_id = public.current_team_id());
CREATE POLICY "req_insert" ON public.requisitions FOR INSERT WITH CHECK (team_id = public.current_team_id());
CREATE POLICY "req_update" ON public.requisitions FOR UPDATE USING (team_id = public.current_team_id());
CREATE POLICY "req_delete" ON public.requisitions FOR DELETE USING (team_id = public.current_team_id());

-- processes
DROP POLICY IF EXISTS "proc_select" ON public.processes;
DROP POLICY IF EXISTS "proc_insert" ON public.processes;
DROP POLICY IF EXISTS "proc_update" ON public.processes;
DROP POLICY IF EXISTS "proc_delete" ON public.processes;
CREATE POLICY "proc_select" ON public.processes FOR SELECT USING (team_id = public.current_team_id());
CREATE POLICY "proc_insert" ON public.processes FOR INSERT WITH CHECK (team_id = public.current_team_id());
CREATE POLICY "proc_update" ON public.processes FOR UPDATE USING (team_id = public.current_team_id());
CREATE POLICY "proc_delete" ON public.processes FOR DELETE USING (team_id = public.current_team_id());

-- interactions
DROP POLICY IF EXISTS "int_select" ON public.interactions;
DROP POLICY IF EXISTS "int_insert" ON public.interactions;
DROP POLICY IF EXISTS "int_update" ON public.interactions;
DROP POLICY IF EXISTS "int_delete" ON public.interactions;
CREATE POLICY "int_select" ON public.interactions FOR SELECT USING (team_id = public.current_team_id());
CREATE POLICY "int_insert" ON public.interactions FOR INSERT WITH CHECK (team_id = public.current_team_id());
CREATE POLICY "int_update" ON public.interactions FOR UPDATE USING (team_id = public.current_team_id());

-- child tables: RLS via parent's team_id (no separate team_id column needed)

-- candidate_motivations
DROP POLICY IF EXISTS "mot_select" ON public.candidate_motivations;
DROP POLICY IF EXISTS "mot_insert" ON public.candidate_motivations;
DROP POLICY IF EXISTS "mot_update" ON public.candidate_motivations;
DROP POLICY IF EXISTS "mot_delete" ON public.candidate_motivations;
CREATE POLICY "mot_select" ON public.candidate_motivations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "mot_insert" ON public.candidate_motivations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "mot_update" ON public.candidate_motivations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "mot_delete" ON public.candidate_motivations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));

-- candidate_blockers
DROP POLICY IF EXISTS "blk_select" ON public.candidate_blockers;
DROP POLICY IF EXISTS "blk_insert" ON public.candidate_blockers;
DROP POLICY IF EXISTS "blk_update" ON public.candidate_blockers;
DROP POLICY IF EXISTS "blk_delete" ON public.candidate_blockers;
CREATE POLICY "blk_select" ON public.candidate_blockers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "blk_insert" ON public.candidate_blockers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "blk_update" ON public.candidate_blockers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "blk_delete" ON public.candidate_blockers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));

-- candidate_roles
DROP POLICY IF EXISTS "role_select" ON public.candidate_roles;
DROP POLICY IF EXISTS "role_insert" ON public.candidate_roles;
DROP POLICY IF EXISTS "role_update" ON public.candidate_roles;
DROP POLICY IF EXISTS "role_delete" ON public.candidate_roles;
CREATE POLICY "role_select" ON public.candidate_roles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "role_insert" ON public.candidate_roles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "role_update" ON public.candidate_roles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "role_delete" ON public.candidate_roles FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));

-- competing_interviews
DROP POLICY IF EXISTS "comp_select" ON public.competing_interviews;
DROP POLICY IF EXISTS "comp_insert" ON public.competing_interviews;
DROP POLICY IF EXISTS "comp_update" ON public.competing_interviews;
DROP POLICY IF EXISTS "comp_delete" ON public.competing_interviews;
CREATE POLICY "comp_select" ON public.competing_interviews FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "comp_insert" ON public.competing_interviews FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "comp_update" ON public.competing_interviews FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));
CREATE POLICY "comp_delete" ON public.competing_interviews FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.team_id = public.current_team_id()));

-- client_contacts (had a single FOR ALL policy named "recruiter_own_client_contacts")
DROP POLICY IF EXISTS "recruiter_own_client_contacts" ON public.client_contacts;
DROP POLICY IF EXISTS "cc_select" ON public.client_contacts;
DROP POLICY IF EXISTS "cc_insert" ON public.client_contacts;
DROP POLICY IF EXISTS "cc_update" ON public.client_contacts;
DROP POLICY IF EXISTS "cc_delete" ON public.client_contacts;
CREATE POLICY "cc_select" ON public.client_contacts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = client_id AND cl.team_id = public.current_team_id()));
CREATE POLICY "cc_insert" ON public.client_contacts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = client_id AND cl.team_id = public.current_team_id()));
CREATE POLICY "cc_update" ON public.client_contacts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = client_id AND cl.team_id = public.current_team_id()));
CREATE POLICY "cc_delete" ON public.client_contacts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.clients cl WHERE cl.id = client_id AND cl.team_id = public.current_team_id()));

-- requisition_conditions
DROP POLICY IF EXISTS "rc_select" ON public.requisition_conditions;
DROP POLICY IF EXISTS "rc_insert" ON public.requisition_conditions;
DROP POLICY IF EXISTS "rc_update" ON public.requisition_conditions;
DROP POLICY IF EXISTS "rc_delete" ON public.requisition_conditions;
CREATE POLICY "rc_select" ON public.requisition_conditions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.team_id = public.current_team_id()));
CREATE POLICY "rc_insert" ON public.requisition_conditions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.team_id = public.current_team_id()));
CREATE POLICY "rc_update" ON public.requisition_conditions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.team_id = public.current_team_id()));
CREATE POLICY "rc_delete" ON public.requisition_conditions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_id AND r.team_id = public.current_team_id()));

-- ai_context_log
DROP POLICY IF EXISTS "acl_select" ON public.ai_context_log;
DROP POLICY IF EXISTS "acl_insert" ON public.ai_context_log;
CREATE POLICY "acl_select" ON public.ai_context_log FOR SELECT
  USING (recruiter_id IN (SELECT id FROM public.recruiters WHERE team_id = public.current_team_id()));
CREATE POLICY "acl_insert" ON public.ai_context_log FOR INSERT
  WITH CHECK (recruiter_id = auth.uid());

-- ─── 9. Update handle_new_user to auto-create a team on signup ────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_team_id uuid;
BEGIN
  INSERT INTO public.teams (name)
  VALUES (COALESCE(
    NEW.raw_user_meta_data->>'agency_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1) || '''s Team'
  ))
  RETURNING id INTO new_team_id;

  INSERT INTO public.recruiters (id, email, full_name, team_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    new_team_id
  );
  RETURN NEW;
END; $$;
