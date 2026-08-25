import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { IconRefresh, IconCheck, IconBellOff } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/candidate-utils";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import {
  isVisible,
  stateKey,
  todayStr,
  usePriorityActionState,
  useUpsertPriorityActionState,
  useDeletePriorityActionState,
  type PriorityActionStateRow,
} from "@/hooks/usePriorityActionState";

const ACTION_TYPE = "re_engage";
const INITIAL_VISIBLE = 8;
const STALE_DAYS = 30;

type DormantCandidate = {
  id: string;
  full_name: string;
  candidate_status: string;
  last_interaction_at: string | null;
};

function useDormantCandidates(recruiterId: string) {
  return useQuery({
    queryKey: ["candidates", recruiterId, "dormant"],
    queryFn: async () => {
      const staleBefore = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();

      const { data: activeProcesses, error: procError } = await supabase
        .from("processes")
        .select("candidate_id")
        .eq("owner_recruiter_id", recruiterId)
        .not("stage", "in", '("Placed","Closed lost")');
      if (procError) throw procError;
      const inActiveProcess = new Set((activeProcesses ?? []).map((p) => p.candidate_id));

      const { data, error } = await supabase
        .from("candidates")
        .select("id, full_name, candidate_status, last_interaction_at")
        .eq("recruiter_id", recruiterId)
        .neq("candidate_status", "placed")
        .or(`last_interaction_at.is.null,last_interaction_at.lt.${staleBefore}`)
        .order("last_interaction_at", { ascending: true, nullsFirst: true });
      if (error) throw error;

      return ((data ?? []) as DormantCandidate[]).filter((c) => !inActiveProcess.has(c.id));
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function CandidateReengagementCard({ recruiterId }: { recruiterId: string }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const { data: candidates = [], isLoading } = useDormantCandidates(recruiterId);
  const { data: stateRows = [] } = usePriorityActionState(recruiterId);
  const upsertState = useUpsertPriorityActionState(recruiterId);
  const deleteState = useDeletePriorityActionState(recruiterId);

  const stateByKey = useMemo(() => {
    const map = new Map<string, PriorityActionStateRow>();
    for (const row of stateRows) map.set(stateKey(row.entity_id, row.action_type), row);
    return map;
  }, [stateRows]);

  const items = candidates.filter((c) => isVisible(stateByKey, c.id, ACTION_TYPE));
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - visible.length;

  function handleDone(candidateId: string) {
    upsertState.mutate({ entity_type: "candidate", entity_id: candidateId, action_type: ACTION_TYPE, status: "done", effective_date: todayStr() });
    toast("Cleared for today.", {
      action: { label: "Undo", onClick: () => deleteState.mutate({ entityId: candidateId, actionType: ACTION_TYPE }) },
      duration: 6000,
    });
  }

  function handleSnooze(candidateId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    upsertState.mutate({ entity_type: "candidate", entity_id: candidateId, action_type: ACTION_TYPE, status: "snoozed", effective_date: tomorrow.toISOString().slice(0, 10) });
    toast("Snoozed until tomorrow.", {
      action: { label: "Undo", onClick: () => deleteState.mutate({ entityId: candidateId, actionType: ACTION_TYPE }) },
      duration: 6000,
    });
  }

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <IconRefresh size={14} style={{ color: "var(--color-ink-60)" }} />
        <span className="text-[12px] font-medium">Worth re-engaging</span>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          No dormant candidates right now.
        </div>
      ) : (
        <>
          <div>
            {visible.map((c) => (
              <div
                key={c.id}
                className="w-full flex items-stretch"
                style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
              >
                <button
                  onClick={() => void navigate({ to: "/candidates/$id", params: { id: c.id }, search: BLANK_CANDIDATE_SEARCH })}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-ink-10)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{c.full_name}</p>
                    <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
                      {c.last_interaction_at ? `Last touched ${relativeTime(c.last_interaction_at)}` : "Never contacted"}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => handleDone(c.id)}
                  className="flex items-center justify-center w-9 transition-colors hover:bg-[--color-moss-light]"
                  title="Clear for today"
                >
                  <IconCheck size={12} style={{ color: "var(--color-ink-30)" }} />
                </button>
                <button
                  onClick={() => handleSnooze(c.id)}
                  className="flex items-center justify-center w-9 transition-colors hover:bg-[--color-gold-light]"
                  title="Snooze until tomorrow"
                >
                  <IconBellOff size={12} style={{ color: "var(--color-ink-30)" }} />
                </button>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full px-4 py-2 text-[12px] text-center"
              style={{ color: "var(--color-indigo)" }}
            >
              Show {hiddenCount} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
