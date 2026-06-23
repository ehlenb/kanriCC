DO $$
DECLARE
  v_team_id       uuid;
  v_recruiter_id  uuid;
  v_candidate_id  uuid;
  v_client_id     uuid;
  v_contact_hr_id uuid;
  v_contact_hm_id uuid;
BEGIN
  SELECT id INTO v_candidate_id FROM public.candidates WHERE full_name = 'Masahiko Tanaka' LIMIT 1;
  IF v_candidate_id IS NULL THEN RETURN; END IF;

  SELECT team_id, recruiter_id INTO v_team_id, v_recruiter_id
    FROM public.candidates WHERE id = v_candidate_id;
  SELECT id INTO v_client_id FROM public.clients WHERE company_name ILIKE '%Salesforce%' LIMIT 1;
  SELECT id INTO v_contact_hr_id FROM public.client_contacts
    WHERE client_id = v_client_id AND role = 'hr_gatekeeper' LIMIT 1;
  SELECT id INTO v_contact_hm_id FROM public.client_contacts
    WHERE client_id = v_client_id AND role = 'hiring_manager' LIMIT 1;

  INSERT INTO public.interactions
    (team_id, recruiter_id, candidate_id, client_id, contact_id, primary_party, interaction_type, interacted_at, summary, full_notes)
  VALUES
    (v_team_id, v_recruiter_id, v_candidate_id, null, null, 'candidate', 'call',
      now() - interval '21 days',
      'Initial intake call — 45 min. Strong FSI background, active and motivated. Flagged competing processes at MSFT and SAP.',
      'Called him via BizReach intro. Very composed on the phone. Confirmed he is actively looking — triggered by Q4 bonus coming in below expectations again. Asked specifically about Salesforce''s Japan team size and leadership stability. Gave him the headline pitch on the AE role. He asked for the JD and compensation range before committing to an interview. Sent JD same day. Follow up in 3 days to confirm interest.'),

    (v_team_id, v_recruiter_id, v_candidate_id, v_client_id, v_contact_hr_id, 'client', 'job spec sent',
      now() - interval '10 days',
      'Submitted Tanaka''s CV to Shimada (HR) with intro note. Watanabe copied.',
      'Sent full submission note with FSI deal history highlights. Shimada acknowledged same day. Watanabe replied within 2 hours — looks interesting, let''s schedule a first interview. Interview confirmed for next week.'),

    (v_team_id, v_recruiter_id, v_candidate_id, v_client_id, v_contact_hm_id, 'client', 'call',
      now() - interval '3 days',
      'CCM1 debrief with Watanabe — positive. Wants to move to panel interview. Feedback: strong on FSI knowledge, slightly light on SaaS sales motion.',
      'Watanabe liked his composure and the MUFG deal story. One concern: Tanaka has not sold pure SaaS before — all Sony deals were hardware/services bundles. Watanabe said this is not a dealbreaker but wants to probe in CCM2 with a discovery roleplay. CCM2 to be scheduled as a panel with Watanabe + one of his senior AEs. Timeline: next 2 weeks. Need to prep Tanaka on the discovery process before CCM2.'),

    (v_team_id, v_recruiter_id, v_candidate_id, null, null, 'candidate', 'note',
      now() - interval '2 days',
      'Candidate check-in — still engaged, Microsoft process moving faster.',
      'Called to share CCM1 feedback and discuss CCM2 timeline. He appreciated the quick turnaround. Flagged that Microsoft has scheduled a final panel for next week. If MSFT moves to offer before we get to CCM2 he will have a decision to make. Asked me to accelerate if possible. Messaged Shimada to push CCM2 scheduling.');
END $$;
