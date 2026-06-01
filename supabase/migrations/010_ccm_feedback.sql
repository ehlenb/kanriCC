-- ═══════════════════════════════════════════════════════════════════════════════
-- 010_ccm_feedback.sql — Structured CCM round feedback on processes
--
-- Adds three columns to processes so recruiters can log client feedback
-- after each interview round in a structured way, making the dashboard's
-- "CCM feedback pending 48h" flag reliable and queryable.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS ccm_outcome text
    CHECK (ccm_outcome IN ('pass', 'fail', 'pending')),
  ADD COLUMN IF NOT EXISTS ccm_feedback_notes text,
  ADD COLUMN IF NOT EXISTS ccm_feedback_at timestamptz;
