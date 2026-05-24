-- ============================================================
-- Kanri — full schema migration
-- ============================================================

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============================================================
-- recruiters (replaces profiles — maps 1:1 to auth.users)
-- ============================================================
CREATE TABLE public.recruiters (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  agency_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recruiters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recruiter_select" ON public.recruiters FOR SELECT USING (auth.uid() = id);
CREATE POLICY "recruiter_insert" ON public.recruiters FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "recruiter_update" ON public.recruiters FOR UPDATE USING (auth.uid() = id);

-- Auto-create recruiter row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.recruiters (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- candidates
-- ============================================================
CREATE TABLE public.candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id          UUID NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  full_name_japanese    TEXT,
  age                   INTEGER,
  current_company       TEXT,
  current_title         TEXT,
  japanese_level        TEXT CHECK (japanese_level IN (
    'Native','Fluent','High Business','Business','Low Business',
    'High Conversational','Conversational','Low Conversational','Basic'
  )),
  english_level         TEXT CHECK (english_level IN (
    'Native','Fluent','High Business','Business','Low Business',
    'High Conversational','Conversational','Low Conversational','Basic'
  )),
  other_languages       TEXT,
  active_passive        TEXT CHECK (active_passive IN ('Active','Passive')),
  urgency_to_move       TEXT CHECK (urgency_to_move IN ('High','Medium','Low')),
  notice_period_months  INTEGER,
  current_base          BIGINT,
  current_bonus         BIGINT,
  current_total         BIGINT,
  expected_total_min    BIGINT,
  expected_total_max    BIGINT,
  base_is_priority      BOOLEAN NOT NULL DEFAULT true,
  base_minimum          BIGINT,
  bonus_preference      TEXT,
  equity_open           BOOLEAN,
  presentation_notes    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX candidates_recruiter_idx ON public.candidates(recruiter_id, updated_at DESC);
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cand_select" ON public.candidates FOR SELECT USING (auth.uid() = recruiter_id);
CREATE POLICY "cand_insert" ON public.candidates FOR INSERT WITH CHECK (auth.uid() = recruiter_id);
CREATE POLICY "cand_update" ON public.candidates FOR UPDATE USING (auth.uid() = recruiter_id);
CREATE POLICY "cand_delete" ON public.candidates FOR DELETE USING (auth.uid() = recruiter_id);
CREATE TRIGGER candidates_touch BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- candidate_motivations
-- ============================================================
CREATE TABLE public.candidate_motivations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  rank            INTEGER NOT NULL CHECK (rank IN (1,2,3)),
  motivation_text TEXT NOT NULL,
  UNIQUE (candidate_id, rank)
);
ALTER TABLE public.candidate_motivations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mot_select" ON public.candidate_motivations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "mot_insert" ON public.candidate_motivations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "mot_update" ON public.candidate_motivations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "mot_delete" ON public.candidate_motivations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));

-- ============================================================
-- candidate_blockers
-- ============================================================
CREATE TABLE public.candidate_blockers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  is_risk      BOOLEAN NOT NULL DEFAULT false,
  theme        TEXT NOT NULL,
  detail       TEXT
);
ALTER TABLE public.candidate_blockers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blk_select" ON public.candidate_blockers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "blk_insert" ON public.candidate_blockers FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "blk_update" ON public.candidate_blockers FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "blk_delete" ON public.candidate_blockers FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));

-- ============================================================
-- candidate_roles (job history)
-- ============================================================
CREATE TABLE public.candidate_roles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  company_name            TEXT NOT NULL,
  title                   TEXT,
  start_date              DATE,
  end_date                DATE,
  is_current              BOOLEAN NOT NULL DEFAULT false,
  achievement_notes       TEXT,
  reason_for_leaving_raw  TEXT  -- INTERNAL ONLY — never exposed to clients
);
CREATE INDEX roles_candidate_idx ON public.candidate_roles(candidate_id, start_date ASC);
ALTER TABLE public.candidate_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_select" ON public.candidate_roles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "role_insert" ON public.candidate_roles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "role_update" ON public.candidate_roles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "role_delete" ON public.candidate_roles FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));

-- ============================================================
-- competing_interviews
-- ============================================================
CREATE TABLE public.competing_interviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  source       TEXT,
  stage        TEXT,
  disclosed_at DATE
);
ALTER TABLE public.competing_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_select" ON public.competing_interviews FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "comp_insert" ON public.competing_interviews FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "comp_update" ON public.competing_interviews FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "comp_delete" ON public.competing_interviews FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_id AND c.recruiter_id = auth.uid()));

-- ============================================================
-- clients
-- ============================================================
CREATE TABLE public.clients (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id              UUID NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  company_name              TEXT NOT NULL,
  years_in_japan            INTEGER,
  japan_team_size           INTEGER,
  japan_team_japanese_pct   INTEGER,
  hiring_manager_name       TEXT,
  hiring_manager_notes      TEXT,
  strategy_notes            TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clients_recruiter_idx ON public.clients(recruiter_id, company_name);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cli_select" ON public.clients FOR SELECT USING (auth.uid() = recruiter_id);
CREATE POLICY "cli_insert" ON public.clients FOR INSERT WITH CHECK (auth.uid() = recruiter_id);
CREATE POLICY "cli_update" ON public.clients FOR UPDATE USING (auth.uid() = recruiter_id);
CREATE POLICY "cli_delete" ON public.clients FOR DELETE USING (auth.uid() = recruiter_id);

-- ============================================================
-- requisitions
-- ============================================================
CREATE TABLE public.requisitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  recruiter_id      UUID NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  salary_min        BIGINT,
  salary_max        BIGINT,
  salary_stretch    BIGINT,
  interview_rounds  INTEGER,
  is_open           BOOLEAN NOT NULL DEFAULT true,
  why_role_opened   TEXT,
  strategic_context TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "req_select" ON public.requisitions FOR SELECT USING (auth.uid() = recruiter_id);
CREATE POLICY "req_insert" ON public.requisitions FOR INSERT WITH CHECK (auth.uid() = recruiter_id);
CREATE POLICY "req_update" ON public.requisitions FOR UPDATE USING (auth.uid() = recruiter_id);
CREATE POLICY "req_delete" ON public.requisitions FOR DELETE USING (auth.uid() = recruiter_id);

-- ============================================================
-- processes
-- ============================================================
CREATE TABLE public.processes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  requisition_id      UUID NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  owner_recruiter_id  UUID NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  stage               TEXT NOT NULL CHECK (stage IN (
    'Buy-in targeting','Screening','1st interview','2nd interview',
    'Final interview','Offer','Closed won','Closed lost'
  )),
  coverage_type       TEXT NOT NULL CHECK (coverage_type IN ('own','colleague','external')),
  ai_snapshot         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX processes_candidate_idx ON public.processes(candidate_id, updated_at DESC);
CREATE INDEX processes_recruiter_idx ON public.processes(owner_recruiter_id, stage);
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proc_select" ON public.processes FOR SELECT USING (auth.uid() = owner_recruiter_id);
CREATE POLICY "proc_insert" ON public.processes FOR INSERT WITH CHECK (auth.uid() = owner_recruiter_id);
CREATE POLICY "proc_update" ON public.processes FOR UPDATE USING (auth.uid() = owner_recruiter_id);
CREATE POLICY "proc_delete" ON public.processes FOR DELETE USING (auth.uid() = owner_recruiter_id);
CREATE TRIGGER processes_touch BEFORE UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- interactions (unified log — candidate and/or client)
-- ============================================================
CREATE TABLE public.interactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id     UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  client_id        UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  process_id       UUID REFERENCES public.processes(id) ON DELETE SET NULL,
  recruiter_id     UUID NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call','email','meeting','note')),
  summary          TEXT,
  full_notes       TEXT,
  interacted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX interactions_candidate_idx ON public.interactions(candidate_id, interacted_at DESC);
CREATE INDEX interactions_client_idx ON public.interactions(client_id, interacted_at DESC);
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "int_select" ON public.interactions FOR SELECT USING (auth.uid() = recruiter_id);
CREATE POLICY "int_insert" ON public.interactions FOR INSERT WITH CHECK (auth.uid() = recruiter_id);
CREATE POLICY "int_update" ON public.interactions FOR UPDATE USING (auth.uid() = recruiter_id);
CREATE POLICY "int_delete" ON public.interactions FOR DELETE USING (auth.uid() = recruiter_id);

-- ============================================================
-- client_package_intelligence
-- ============================================================
CREATE TABLE public.client_package_intelligence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  base_pct_of_total     INTEGER,
  bonus_type            TEXT,
  last_bonus_payout_pct INTEGER,
  has_rsu               BOOLEAN,
  rsu_notes             TEXT,
  confirmed_stretch     BIGINT,
  last_updated          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_package_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pkg_select" ON public.client_package_intelligence FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "pkg_insert" ON public.client_package_intelligence FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.recruiter_id = auth.uid()));
CREATE POLICY "pkg_update" ON public.client_package_intelligence FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.recruiter_id = auth.uid()));
