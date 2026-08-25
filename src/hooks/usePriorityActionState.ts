import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PriorityActionStateRow = {
  id: string;
  entity_id: string;
  action_type: string;
  status: "done" | "snoozed";
  effective_date: string;
};

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function stateKey(entityId: string, actionType: string): string {
  return `${entityId}:${actionType}`;
}

export function isVisible(stateByKey: Map<string, PriorityActionStateRow>, entityId: string, actionType: string): boolean {
  const row = stateByKey.get(stateKey(entityId, actionType));
  if (!row) return true;
  const today = todayStr();
  if (row.status === "done") return row.effective_date !== today;
  return !(row.effective_date > today);
}

export function usePriorityActionState(recruiterId: string) {
  return useQuery({
    queryKey: ["priority-action-state", recruiterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("priority_action_state")
        .select("id, entity_id, action_type, status, effective_date")
        .eq("recruiter_id", recruiterId);
      if (error) throw error;
      return (data ?? []) as PriorityActionStateRow[];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useUpsertPriorityActionState(recruiterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { entity_type: string; entity_id: string; action_type: string; status: "done" | "snoozed"; effective_date: string }) => {
      const { error } = await supabase
        .from("priority_action_state")
        .upsert({ recruiter_id: recruiterId, ...row }, { onConflict: "recruiter_id,entity_id,action_type" });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["priority-action-state", recruiterId] }),
  });
}

export function useDeletePriorityActionState(recruiterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { entityId: string; actionType: string }) => {
      const { error } = await supabase
        .from("priority_action_state")
        .delete()
        .eq("recruiter_id", recruiterId)
        .eq("entity_id", vars.entityId)
        .eq("action_type", vars.actionType);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["priority-action-state", recruiterId] }),
  });
}
