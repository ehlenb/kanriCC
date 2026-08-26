-- Migration 056: recruiter corrections to reconciled memory
--
-- Finding from the post-audit design review: ai_context is the only AI
-- output in the entire product the recruiter cannot edit. CLAUDE.md Section
-- 2 states editability as a trust doctrine ("recruiters must be able to edit
-- all AI-generated output inline before using it... any exception requires
-- an explicit decision recorded in this file") -- no such decision exists,
-- and the exception was never noticed because CandidateIntelligenceCard and
-- ClientIntelligenceCard both render ai_context as a static <p> tag.
--
-- The hard part is not "let them type into the box" -- it's that
-- refresh-context.ts fully regenerates ai_context from raw interactions on
-- every automatic refresh (the pgmq/pg_cron pipeline fires on every
-- interaction insert). A direct in-place edit to ai_context would be
-- silently discarded the next time the recruiter logs an interaction, which
-- is a normal, frequent action -- so the fix cannot just be "make the field
-- editable," it has to survive the next regeneration.
--
-- The fix: a second, durable pair of columns per entity. The recruiter's
-- edit is saved to *both* ai_context (so it displays immediately, matching
-- every other editable AI surface) and ai_context_correction (a pinned,
-- dated statement of fact). refresh-context.ts feeds the correction into its
-- reconciliation prompt as an authoritative input, using the exact same
-- recency-weighting device it already uses for interactions ("a recent
-- interaction contradicts an older one, the recent value wins") -- a
-- correction is superseded only by a specific, dated interaction that says
-- something different, never silently overwritten by a full regeneration.
-- ai_context_correction is never cleared by refresh-context; only a new
-- recruiter edit replaces it.
--
-- Scope: candidates and clients only. requisitions.ai_context has no
-- rendering surface anywhere in the frontend today (only handoff-pack.ts
-- reads it, server-side) -- adding a correction UI there would be new
-- feature work, not a fix to a found violation, and CLAUDE.md's "does the
-- recruiter need this in the next 60 seconds" bar argues against inventing
-- one in this pass. Revisit if a requisition-facing ai_context display is
-- ever built.

ALTER TABLE candidates
  ADD COLUMN ai_context_correction text,
  ADD COLUMN ai_context_correction_at timestamptz;

ALTER TABLE clients
  ADD COLUMN ai_context_correction text,
  ADD COLUMN ai_context_correction_at timestamptz;
