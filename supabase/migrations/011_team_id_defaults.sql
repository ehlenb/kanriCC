-- ═══════════════════════════════════════════════════════════════════════════════
-- 011_team_id_defaults.sql
--
-- Adds SQL DEFAULT expressions to team_id columns so the Supabase-generated
-- TypeScript types mark them as optional on Insert (matching the trigger
-- behaviour added in 009). Only needed on tables where NOT NULL was enforced.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.candidates   ALTER COLUMN team_id SET DEFAULT public.current_team_id();
ALTER TABLE public.clients      ALTER COLUMN team_id SET DEFAULT public.current_team_id();
ALTER TABLE public.requisitions ALTER COLUMN team_id SET DEFAULT public.current_team_id();
ALTER TABLE public.processes    ALTER COLUMN team_id SET DEFAULT public.current_team_id();
