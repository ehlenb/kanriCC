-- ── team_id indexes ───────────────────────────────────────────────────────────
-- Every RLS policy in this schema filters on team_id (directly or via
-- current_team_id()). None of these foreign keys had a covering index.

CREATE INDEX IF NOT EXISTS idx_candidates_team_id ON public.candidates(team_id);
CREATE INDEX IF NOT EXISTS idx_clients_team_id ON public.clients(team_id);
CREATE INDEX IF NOT EXISTS idx_processes_team_id ON public.processes(team_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_team_id ON public.requisitions(team_id);
CREATE INDEX IF NOT EXISTS idx_interactions_team_id ON public.interactions(team_id);
CREATE INDEX IF NOT EXISTS idx_recruiters_team_id ON public.recruiters(team_id);
CREATE INDEX IF NOT EXISTS idx_candidate_lists_team_id ON public.candidate_lists(team_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_team_id ON public.import_batches(team_id);
CREATE INDEX IF NOT EXISTS idx_recall_bot_sessions_team_id ON public.recall_bot_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_oauth_tokens_team_id ON public.recruiter_oauth_tokens(team_id);
CREATE INDEX IF NOT EXISTS idx_priority_action_state_team_id ON public.priority_action_state(team_id);

-- ── RLS: wrap auth.uid() as (select auth.uid()) ─────────────────────────────────
-- Lets Postgres evaluate it once per query (initplan) instead of once per row.
-- Grants and policy identity are unchanged — same predicate, cheaper evaluation.
-- Policies using current_team_id() are not touched here; that function is a
-- plain SQL STABLE function the planner already inlines/caches, and the
-- Supabase advisor does not flag any policy that goes through it.

-- recruiters
ALTER POLICY recruiter_insert ON public.recruiters WITH CHECK ((select auth.uid()) = id);
ALTER POLICY recruiter_update ON public.recruiters USING ((select auth.uid()) = id);
ALTER POLICY recruiter_select ON public.recruiters USING ((id = (select auth.uid())) OR (team_id = current_team_id()));

-- client_package_intelligence
ALTER POLICY pkg_select ON public.client_package_intelligence USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_package_intelligence.client_id AND c.recruiter_id = (select auth.uid())));
ALTER POLICY pkg_insert ON public.client_package_intelligence WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_package_intelligence.client_id AND c.recruiter_id = (select auth.uid())));
ALTER POLICY pkg_update ON public.client_package_intelligence USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_package_intelligence.client_id AND c.recruiter_id = (select auth.uid())));

-- recall_bot_sessions
ALTER POLICY "recruiter can insert bot session" ON public.recall_bot_sessions WITH CHECK (recruiter_id = (select auth.uid()));
ALTER POLICY "team members can read bot sessions" ON public.recall_bot_sessions USING (team_id = (SELECT recruiters.team_id FROM recruiters WHERE recruiters.id = (select auth.uid())));

-- ai_context_log
ALTER POLICY acl_insert ON public.ai_context_log WITH CHECK (recruiter_id = (select auth.uid()));

-- candidate_lists
ALTER POLICY lists_select ON public.candidate_lists USING (((visibility = 'team') AND (team_id = current_team_id())) OR ((visibility = 'private') AND (created_by = (select auth.uid()))));
ALTER POLICY lists_update ON public.candidate_lists USING (created_by = (select auth.uid()));
ALTER POLICY lists_delete ON public.candidate_lists USING (created_by = (select auth.uid()));

-- recruiter_oauth_tokens
ALTER POLICY "team members can view own team oauth tokens" ON public.recruiter_oauth_tokens USING (team_id = (SELECT recruiters.team_id FROM recruiters WHERE recruiters.id = (select auth.uid())));
ALTER POLICY "recruiter can insert own token" ON public.recruiter_oauth_tokens WITH CHECK (recruiter_id = (select auth.uid()));
ALTER POLICY "recruiter can update own token" ON public.recruiter_oauth_tokens USING (recruiter_id = (select auth.uid()));
ALTER POLICY "recruiter can delete own token" ON public.recruiter_oauth_tokens USING (recruiter_id = (select auth.uid()));

-- import_batches
ALTER POLICY "team members can read import batches" ON public.import_batches USING (team_id = (SELECT recruiters.team_id FROM recruiters WHERE recruiters.id = (select auth.uid())));
ALTER POLICY "recruiter can insert import batch" ON public.import_batches WITH CHECK (recruiter_id = (select auth.uid()));
ALTER POLICY "recruiter can update own import batch" ON public.import_batches USING (recruiter_id = (select auth.uid()));

-- import_batch_items
ALTER POLICY "team members can read import batch items" ON public.import_batch_items USING (batch_id IN (SELECT import_batches.id FROM import_batches WHERE import_batches.team_id = (SELECT recruiters.team_id FROM recruiters WHERE recruiters.id = (select auth.uid()))));

-- priority_action_state
ALTER POLICY pas_select ON public.priority_action_state USING (recruiter_id = (select auth.uid()));
ALTER POLICY pas_insert ON public.priority_action_state WITH CHECK (recruiter_id = (select auth.uid()));
ALTER POLICY pas_update ON public.priority_action_state USING (recruiter_id = (select auth.uid()));
ALTER POLICY pas_delete ON public.priority_action_state USING (recruiter_id = (select auth.uid()));
