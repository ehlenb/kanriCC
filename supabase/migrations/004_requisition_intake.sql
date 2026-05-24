-- Migration 004: Extended requisition intake fields
-- Run after 001_full_schema.sql, 002_client_contacts.sql, 003_candidate_notes.sql

ALTER TABLE requisitions
  -- Section A — Role basics
  ADD COLUMN IF NOT EXISTS urgency TEXT
    CHECK (urgency IN ('critical', 'high', 'normal', 'low'))
    DEFAULT 'normal',

  -- Section B — Ideal candidate profile
  ADD COLUMN IF NOT EXISTS ideal_candidate_notes TEXT,
  ADD COLUMN IF NOT EXISTS age_min INTEGER,
  ADD COLUMN IF NOT EXISTS age_max INTEGER,
  ADD COLUMN IF NOT EXISTS japanese_level_required TEXT,
  ADD COLUMN IF NOT EXISTS english_level_required TEXT,
  ADD COLUMN IF NOT EXISTS industry_must_haves TEXT,
  ADD COLUMN IF NOT EXISTS flexibility_notes TEXT,

  -- Section C — Interview process
  -- JSON array: [{round: 1, interviewer: "...", focus: "..."}, ...]
  ADD COLUMN IF NOT EXISTS interview_structure JSONB,
  ADD COLUMN IF NOT EXISTS has_skills_test BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skills_test_notes TEXT,
  ADD COLUMN IF NOT EXISTS hm_can_meet_in_person BOOLEAN,

  -- Section D — Hiring manager intelligence
  ADD COLUMN IF NOT EXISTS hm_communication_style TEXT,
  ADD COLUMN IF NOT EXISTS hm_rejection_patterns TEXT,
  ADD COLUMN IF NOT EXISTS hm_priority_beyond_jd TEXT,

  -- Section E — Competition and urgency signals
  ADD COLUMN IF NOT EXISTS other_agencies BOOLEAN,
  ADD COLUMN IF NOT EXISTS other_agency_names TEXT,
  ADD COLUMN IF NOT EXISTS open_to_foreign_candidates BOOLEAN,
  ADD COLUMN IF NOT EXISTS internal_candidate BOOLEAN,
  ADD COLUMN IF NOT EXISTS target_start_date DATE;
