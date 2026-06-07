-- ─────────────────────────────────────────────────────────────────────────────
-- Kanri mock seed — full deal cycle scenario
-- Run once in: Supabase Dashboard → SQL Editor
--
-- Scenario: Salesforce Japan is hiring a Senior Account Executive.
--   Candidate: Masahiko Tanaka, currently at Sony, wants to move to gaishikei.
--   One process, CCM1 stage, active pipeline.
--
-- This script resolves your team_id and recruiter_id automatically from the
-- currently authenticated session via auth.uid(). Run it while logged in to
-- Supabase as yourself — or paste your user UUID below if running as service role.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_recruiter_id  uuid := auth.uid();
  v_team_id       uuid;

  v_client_id     uuid := gen_random_uuid();
  v_contact_hm_id uuid := gen_random_uuid();
  v_contact_hr_id uuid := gen_random_uuid();
  v_req_id        uuid := gen_random_uuid();
  v_candidate_id  uuid := gen_random_uuid();
  v_process_id    uuid := gen_random_uuid();
BEGIN
  -- ── resolve team_id ─────────────────────────────────────────────────────────
  SELECT team_id INTO v_team_id FROM public.recruiters WHERE id = v_recruiter_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve team_id for user %. Make sure you are logged in.', v_recruiter_id;
  END IF;

  -- ── client: Salesforce Japan ─────────────────────────────────────────────────
  INSERT INTO public.clients (
    id, team_id, recruiter_id,
    company_name, status, is_active,
    fee_pct, started_at, contract_signed,
    years_in_japan, japan_team_size, japan_team_japanese_pct,
    japan_role_in_group, kk_entity,
    strategy_notes
  ) VALUES (
    v_client_id, v_team_id, v_recruiter_id,
    'Salesforce Japan', 'active', true,
    32, '2023-04-01', true,
    25, 800, 60,
    'Regional HQ for APAC Sales', 'Salesforce Japan G.K.',
    'Strong hiring momentum in FY2025. Focus on Enterprise segment. HM is data-driven — candidates need strong SaaS AE metrics, not just relationships. Japan team is 60% Japanese nationals which is a strong sell for domestic-company candidates who fear instability. Budget approved for 3 AE headcount this quarter.'
  );

  -- ── client contacts ──────────────────────────────────────────────────────────
  INSERT INTO public.client_contacts (
    id, recruiter_id, client_id,
    name, title, role,
    is_primary, relationship_score,
    bypass_hr_warning
  ) VALUES (
    v_contact_hm_id, v_recruiter_id, v_client_id,
    'Kenji Watanabe', 'VP Enterprise Sales, Japan',
    'hiring_manager',
    true, 4,
    false
  );

  INSERT INTO public.client_contacts (
    id, recruiter_id, client_id,
    name, title, role,
    is_primary, relationship_score,
    bypass_hr_warning
  ) VALUES (
    v_contact_hr_id, v_recruiter_id, v_client_id,
    'Yuki Shimada', 'Senior HR Business Partner',
    'hr_gatekeeper',
    false, 3,
    false
  );

  -- ── requisition: Senior AE ───────────────────────────────────────────────────
  INSERT INTO public.requisitions (
    id, team_id, recruiter_id,
    client_id, title, is_open, is_backfill,
    salary_min, salary_max, salary_range_text,
    location, urgency_date,
    hiring_manager_id,
    strategic_context
  ) VALUES (
    v_req_id, v_team_id, v_recruiter_id,
    v_client_id,
    'Senior Account Executive — Enterprise',
    true, false,
    12000000, 16000000, '¥12M–¥16M base + uncapped commission',
    'Tokyo (hybrid, 2 days in office)',
    '2025-09-30',
    v_contact_hm_id,
    'This is a backfill following a top performer moving to Salesforce HQ. Watanabe wants someone who can own the financial services vertical — FSI accounts represent 40% of Japan revenue. Candidate must be comfortable presenting in Japanese to C-level and in English to regional leadership. Deal sizes typically ¥50M–¥200M ACV. No skills test — Watanabe makes the hire decision after one panel interview.'
  );

  -- ── candidate: Masahiko Tanaka ───────────────────────────────────────────────
  INSERT INTO public.candidates (
    id, team_id, recruiter_id,
    full_name, full_name_japanese,
    date_of_birth, age,
    email, phone,
    current_company, current_title,
    japanese_level, english_level,
    current_base, current_bonus, current_total,
    expected_total_min, expected_total_max,
    base_is_priority, base_minimum,
    notice_period_months,
    source, candidate_status, active_passive,
    urgency_notes,
    notes_personality,
    notes_pitch,
    notes_closing,
    comp_notes
  ) VALUES (
    v_candidate_id, v_team_id, v_recruiter_id,
    'Masahiko Tanaka', '田中 雅彦',
    '1990-07-14', 34,
    'masahiko.tanaka@gmail.com', '+81-90-1234-5678',
    'Sony Corporation', 'Senior Solutions Consultant',
    'Native', 'Fluent',
    9500000, 800000, 10300000,
    13000000, 16000000,
    true, 12000000,
    3,
    'bizreach', 'active', 'Active',
    'Currently active and interviewing. Has two other processes ongoing — one at Microsoft Japan (CCM2) and one at SAP Japan (first interview done). Timing-sensitive. Likely to receive an offer within 6 weeks.',
    'Calm, methodical thinker. Asks good questions before answering. Slightly reserved in first meetings but warms up quickly. Will need reassurance on stability — Sony brand identity is strong for him. Not a big talker but very credible.',
    'Strong FSI background — 6 years covering Japan''s top banks and insurance companies at Sony. Has existing relationships with CFOs at MUFG and Tokio Marine. Salesforce''s financial services cloud is a natural fit. His current ceiling at Sony is a director role in 4+ years; Salesforce can offer that in 18 months.',
    'Motivated by title progression and comp. Verify that the AE role has a clear path to Senior AE or team lead within 2 years — Watanabe has confirmed this is possible. If he gets a counter from Sony, use the fact that Sony promoted him twice in 6 years but has not once adjusted his base significantly.',
    'Sony base is ¥9.5M which is below market for his level. Bonus is performance-linked but has paid out at ¥0.8M each of the last 2 years — capped upside. He knows this. Base floor of ¥12M is non-negotiable. Open to slightly lower total if uncapped commission is credible.'
  );

  -- ── candidate roles ──────────────────────────────────────────────────────────
  INSERT INTO public.candidate_roles (
    candidate_id,
    company_name, title,
    start_date, end_date, is_current,
    achievement_notes,
    reason_for_leaving_raw
  ) VALUES
  (
    v_candidate_id,
    'Fujitsu Limited', 'IT Solutions Sales',
    '2014-04-01', '2019-07-01', false,
    'Managed SMB accounts across the Kanto region. Consistently hit 110% of quota. Moved to Sony for a larger enterprise scope and FSI focus.',
    'Wanted to move into larger enterprise deals and a more strategic sales motion. Sony offered a specific FSI vertical role that Fujitsu could not match at the time.'
  ),
  (
    v_candidate_id,
    'Sony Corporation', 'Senior Solutions Consultant',
    '2019-08-01', null, true,
    'Owns the FSI vertical for Sony''s B2B solutions division. Key accounts include MUFG, Tokio Marine, and Nomura. Closed ¥1.2B in total contract value over 5 years. Promoted twice — from Consultant to Senior Consultant to current level. Manages 2 junior consultants. Most recent deal: ¥180M 3-year contract with a regional bank.',
    null
  );

  -- ── candidate motivations ────────────────────────────────────────────────────
  INSERT INTO public.candidate_motivations (
    candidate_id, rank, motivation_text
  ) VALUES
  (v_candidate_id, 1, 'Career progression — wants a clear path to a leadership or senior individual contributor role within 2 years. Sony''s promotion timeline is seniority-based and he has hit the ceiling for his tenure.'),
  (v_candidate_id, 2, 'Compensation — base salary has not kept pace with his output. Wants ¥12M+ base with real upside through commission or variable pay tied to his own performance, not team results.'),
  (v_candidate_id, 3, 'Working environment — wants more autonomy, fewer internal approval layers, and a global team context. Interested in working in English as a day-to-day language.');

  -- ── candidate blockers ───────────────────────────────────────────────────────
  INSERT INTO public.candidate_blockers (
    candidate_id, theme, detail, is_risk
  ) VALUES
  (
    v_candidate_id,
    'Stability concern',
    'Worried about foreign company stability — "what if Japan operations are cut?" Has seen colleagues at foreign firms face headcount reductions. Will need reassurance that Salesforce Japan is a core market, not a satellite.',
    true
  ),
  (
    v_candidate_id,
    'Competing processes',
    'Microsoft Japan is at CCM2 — their process is 3–4 weeks ahead of ours. SAP Japan has completed first interview. He is unlikely to wait more than 6 weeks for an offer from any company.',
    true
  );

  -- ── competing interviews ─────────────────────────────────────────────────────
  INSERT INTO public.competing_interviews (
    candidate_id, company_name, source, stage, disclosed_at, is_active
  ) VALUES
  (v_candidate_id, 'Microsoft Japan', 'bizreach', 'CCM2', now() - interval '14 days', true),
  (v_candidate_id, 'SAP Japan', 'referral', 'CCM1', now() - interval '7 days', true);

  -- ── process: Tanaka × Salesforce AE ─────────────────────────────────────────
  INSERT INTO public.processes (
    id, team_id, owner_recruiter_id,
    candidate_id, requisition_id,
    stage, coverage_type,
    buy_in_confirmed_at, cv_sent_at
  ) VALUES (
    v_process_id, v_team_id, v_recruiter_id,
    v_candidate_id, v_req_id,
    'CCM1', 'own',
    now() - interval '12 days',
    now() - interval '10 days'
  );

  -- ── interactions ─────────────────────────────────────────────────────────────
  -- Initial intake call with Tanaka
  INSERT INTO public.interactions (
    team_id, recruiter_id,
    candidate_id, client_id, contact_id,
    primary_party, interaction_type,
    interacted_at, summary, full_notes
  ) VALUES (
    v_team_id, v_recruiter_id,
    v_candidate_id, null, null,
    'candidate', 'call',
    now() - interval '21 days',
    'Initial intake call — 45 min. Strong FSI background, active and motivated. Flagged competing processes at MSFT and SAP.',
    'Called him via BizReach intro. Very composed on the phone. Confirmed he is actively looking — triggered by Q4 bonus coming in below expectations again. Asked specifically about Salesforce''s Japan team size and leadership stability. Gave him the headline pitch on the AE role. He asked for the JD and compensation range before committing to an interview. Sent JD same day. Follow up in 3 days to confirm interest.'
  );

  -- Sent CV to Salesforce, logged against both candidate and client
  INSERT INTO public.interactions (
    team_id, recruiter_id,
    candidate_id, client_id, contact_id,
    primary_party, interaction_type,
    interacted_at, summary, full_notes
  ) VALUES (
    v_team_id, v_recruiter_id,
    v_candidate_id, v_client_id, v_contact_hr_id,
    'client', 'job spec sent',
    now() - interval '10 days',
    'Submitted Tanaka''s CV to Shimada (HR) with intro note. Watanabe copied.',
    'Sent full submission note with FSI deal history highlights. Shimada acknowledged same day. Watanabe replied within 2 hours — "looks interesting, let''s schedule a first interview." Interview confirmed for next week.'
  );

  -- CCM1 debrief call with Watanabe
  INSERT INTO public.interactions (
    team_id, recruiter_id,
    candidate_id, client_id, contact_id,
    primary_party, interaction_type,
    interacted_at, summary, full_notes
  ) VALUES (
    v_team_id, v_recruiter_id,
    v_candidate_id, v_client_id, v_contact_hm_id,
    'client', 'call',
    now() - interval '3 days',
    'CCM1 debrief with Watanabe — positive. Wants to move to panel interview. Feedback: strong on FSI knowledge, slightly light on SaaS sales motion.',
    'Watanabe liked his composure and the MUFG deal story. One concern: Tanaka has not sold pure SaaS before — all Sony deals were hardware/services bundles. Watanabe said this is not a dealbreaker but wants to probe in CCM2 with a discovery roleplay. CCM2 to be scheduled as a panel with Watanabe + one of his senior AEs. Timeline: next 2 weeks. Need to prep Tanaka on the discovery process before CCM2.'
  );

  -- Note logged after candidate check-in
  INSERT INTO public.interactions (
    team_id, recruiter_id,
    candidate_id, client_id, contact_id,
    primary_party, interaction_type,
    interacted_at, summary, full_notes
  ) VALUES (
    v_team_id, v_recruiter_id,
    v_candidate_id, null, null,
    'candidate', 'note',
    now() - interval '2 days',
    'Candidate check-in — still engaged, Microsoft process moving faster.',
    'Called to share CCM1 feedback and discuss CCM2 timeline. He appreciated the quick turnaround. Flagged that Microsoft has scheduled a final panel for next week. If MSFT moves to offer before we get to CCM2 he will have a decision to make. Asked me to accelerate if possible. Messaged Shimada to push CCM2 scheduling.'
  );

  RAISE NOTICE '──────────────────────────────────────────────────';
  RAISE NOTICE 'Seed complete.';
  RAISE NOTICE 'Client:      Salesforce Japan       (%)', v_client_id;
  RAISE NOTICE 'Requisition: Senior AE — Enterprise (%)', v_req_id;
  RAISE NOTICE 'Candidate:   Masahiko Tanaka         (%)', v_candidate_id;
  RAISE NOTICE 'Process:     CCM1 (own coverage)     (%)', v_process_id;
  RAISE NOTICE '──────────────────────────────────────────────────';
END $$;
