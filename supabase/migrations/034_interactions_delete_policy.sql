-- Restore delete policy on interactions (dropped in 009, never recreated)
DROP POLICY IF EXISTS "int_delete" ON public.interactions;
CREATE POLICY "int_delete" ON public.interactions
  FOR DELETE USING (team_id = public.current_team_id());
