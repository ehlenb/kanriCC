-- 020_placed_fee.sql
-- Add placed_fee_jpy to processes so placement revenue can be tracked.
-- Recruiter enters this when closing a placement (stage = 'Placed').

ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS placed_fee_jpy INTEGER;
