-- Add free-text recruiter notes to requisitions.
-- Separate from strategic_context (AI framing) — this is the recruiter's
-- own running notes on a role: what the client said, nuances, red flags, etc.

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS recruiter_notes text;
