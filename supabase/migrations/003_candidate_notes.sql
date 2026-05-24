-- ──────────────────────────────────────────────────────────────────────────────
-- 003: Candidate notes template fields
-- Run in Supabase SQL editor after 001 and 002
-- ──────────────────────────────────────────────────────────────────────────────
--
-- Adds five structured note fields to the candidates table.
-- These power the "Notes" tab in the candidate profile.
--
-- AI access rules:
--   notes_presentation  → AI reads: submission note, email pitch, call scripts
--   notes_personality   → AI reads: pre-call briefing, coaching guidance
--   notes_pitch         → AI reads: submission note key points, strategic fit
--   notes_closing       → AI reads: closing script, counteroffer prep, resignation prep
--   notes_internal      → AI NEVER reads. Internal recruiter concerns only.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS notes_presentation TEXT,
  ADD COLUMN IF NOT EXISTS notes_personality   TEXT,
  ADD COLUMN IF NOT EXISTS notes_pitch         TEXT,
  ADD COLUMN IF NOT EXISTS notes_closing       TEXT,
  ADD COLUMN IF NOT EXISTS notes_internal      TEXT; -- AI NEVER reads this field
