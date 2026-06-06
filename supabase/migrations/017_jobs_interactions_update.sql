-- Migration 017: fix requisitions missing columns + interactions cross-linking

-- ── requisitions: add missing columns ────────────────────────────────────────
ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS is_backfill BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hiring_manager_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS salary_range_text TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS urgency_date DATE;

-- ── interactions: cross-linking fields ───────────────────────────────────────
-- contact_id: which specific client contact was involved in this interaction
-- primary_party: who you were primarily speaking with
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_party TEXT CHECK (primary_party IN ('candidate', 'client'));
