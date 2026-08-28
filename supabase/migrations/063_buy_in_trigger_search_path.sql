-- Migration 063: pin search_path on the migration-061 buy-in trigger function
-- (Supabase advisor: function_search_path_mutable). The pre-existing
-- sync_process_last_activity / sync_candidate_last_interaction functions have the
-- same finding and are left as-is; this just avoids adding a new one.
ALTER FUNCTION public.sync_process_buy_in() SET search_path = public;
