-- ── priority_action_state: new table ──────────────────────────────────────────
-- Replaces the dashboard's localStorage-based "done today" / "snoozed" state,
-- which was invisible to teammates and lost on device change. Personal state
-- only, scoped to the owning recruiter — the priority queue is never shared
-- (Section 5), so RLS here is stricter than the usual team-wide read pattern.

CREATE TABLE public.priority_action_state (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id   uuid        NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  team_id        uuid        NOT NULL REFERENCES public.teams(id),
  entity_type    text        NOT NULL CHECK (entity_type IN ('candidate', 'client', 'requisition')),
  entity_id      uuid        NOT NULL,
  action_type    text        NOT NULL,
  status         text        NOT NULL CHECK (status IN ('done', 'snoozed')),
  effective_date date        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruiter_id, entity_id, action_type)
);

ALTER TABLE public.priority_action_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pas_select" ON public.priority_action_state FOR SELECT USING (recruiter_id = auth.uid());
CREATE POLICY "pas_insert" ON public.priority_action_state FOR INSERT WITH CHECK (recruiter_id = auth.uid());
CREATE POLICY "pas_update" ON public.priority_action_state FOR UPDATE USING (recruiter_id = auth.uid());
CREATE POLICY "pas_delete" ON public.priority_action_state FOR DELETE USING (recruiter_id = auth.uid());

CREATE TRIGGER priority_action_state_set_team_id
  BEFORE INSERT ON public.priority_action_state
  FOR EACH ROW EXECUTE FUNCTION public.set_team_id_from_recruiter();
