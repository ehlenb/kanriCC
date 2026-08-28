-- Recruiter-authored reusable email templates for the candidate-page Email composer.
-- category: which composer mode the template belongs to ('general' shows in every mode).
-- visibility: 'team' (default, everyone on the team sees it) or 'private' (only the author).
-- RLS mirrors candidate_lists (migration 013), with (select auth.uid()) per the
-- Section 5 new-table checklist. team_id inline default + indexes from the start
-- (migration 054 convention).

CREATE TABLE public.email_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL DEFAULT public.current_team_id() REFERENCES public.teams(id),
  created_by  uuid        NOT NULL REFERENCES public.recruiters(id),
  name        text        NOT NULL,
  category    text        NOT NULL CHECK (category IN ('job_spec', 'client', 'general')),
  subject     text,
  body        text        NOT NULL,
  visibility  text        NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_templates_team_id ON public.email_templates(team_id);
CREATE INDEX idx_email_templates_created_by ON public.email_templates(created_by);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_select" ON public.email_templates FOR SELECT
  USING (
    (visibility = 'team'    AND team_id = public.current_team_id()) OR
    (visibility = 'private' AND created_by = (select auth.uid()))
  );

CREATE POLICY "email_templates_insert" ON public.email_templates FOR INSERT
  WITH CHECK (team_id = public.current_team_id());

CREATE POLICY "email_templates_update" ON public.email_templates FOR UPDATE
  USING (created_by = (select auth.uid()));

CREATE POLICY "email_templates_delete" ON public.email_templates FOR DELETE
  USING (created_by = (select auth.uid()));

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
