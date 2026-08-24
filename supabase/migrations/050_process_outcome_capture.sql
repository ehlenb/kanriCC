-- ── processes: structured closed-lost reason category ────────────────────────
-- Mirrors ccm_outcome's working shape (constrained enum) rather than relying
-- solely on the pre-existing free-text closed_reason column, which has had a
-- 100% non-write rate in production since migration 008.

ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS closed_reason_category text
    CHECK (closed_reason_category IN (
      'client_rejected', 'candidate_withdrew', 'counteroffer', 'competing_offer',
      'salary_mismatch', 'client_cancelled_role', 'no_response', 'other'
    ));
