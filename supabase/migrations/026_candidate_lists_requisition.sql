-- Tie candidate lists to a specific requisition so spec shortlists
-- persist per role and survive page navigation.

ALTER TABLE public.candidate_lists
  ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES public.requisitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS candidate_lists_requisition_id_idx
  ON public.candidate_lists (requisition_id);
