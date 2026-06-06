-- Migration 018: urgency_notes and comp_notes columns on candidates
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS urgency_notes text,
  ADD COLUMN IF NOT EXISTS comp_notes    text;
