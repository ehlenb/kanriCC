-- Migration 013: candidate_lists
-- Stores saved candidate lists from Advanced Search (AI, manual, and merged).

CREATE TABLE public.candidate_lists (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  created_by   uuid        NOT NULL REFERENCES public.recruiters(id),
  visibility   text        NOT NULL DEFAULT 'team'
                           CHECK (visibility IN ('private', 'team')),
  candidate_ids uuid[]     NOT NULL DEFAULT '{}',
  source       text        NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('ai', 'manual', 'merged')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  team_id      uuid        NOT NULL REFERENCES public.teams(id)
);

-- RLS
ALTER TABLE public.candidate_lists ENABLE ROW LEVEL SECURITY;

-- Team members see: all team-visibility lists in their team, plus their own private lists
CREATE POLICY "lists_select" ON public.candidate_lists FOR SELECT
  USING (
    (visibility = 'team'    AND team_id = public.current_team_id()) OR
    (visibility = 'private' AND created_by = auth.uid())
  );

-- Any authenticated team member can insert (team_id auto-set by trigger)
CREATE POLICY "lists_insert" ON public.candidate_lists FOR INSERT
  WITH CHECK (team_id = public.current_team_id());

-- Only the creator can update
CREATE POLICY "lists_update" ON public.candidate_lists FOR UPDATE
  USING (created_by = auth.uid());

-- Only the creator can delete
CREATE POLICY "lists_delete" ON public.candidate_lists FOR DELETE
  USING (created_by = auth.uid());

-- Auto-populate team_id on insert (same pattern as other tables)
CREATE TRIGGER candidate_lists_set_team_id
  BEFORE INSERT ON public.candidate_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidate_lists_updated_at
  BEFORE UPDATE ON public.candidate_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
