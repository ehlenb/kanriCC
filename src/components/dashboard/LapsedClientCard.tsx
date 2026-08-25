import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { IconBuildingWarehouse, IconCheck, IconBellOff } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/candidate-utils";
import {
  isVisible,
  stateKey,
  todayStr,
  usePriorityActionState,
  useUpsertPriorityActionState,
  useDeletePriorityActionState,
  type PriorityActionStateRow,
} from "@/hooks/usePriorityActionState";

// Lapsed-client detection (Wave 6, piece 5): a client whose most recent
// requisition is 9+ months old and who currently has zero open requisitions
// -- a win-back opportunity, not just silence. Pure arithmetic on already-
// captured requisition dates, no AI call. Scoped to the recruiter's own
// owner_recruiter_id, same secondary-card scoping precedent as
// CandidateReengagementCard/JobChangeSignalCard.

const ACTION_TYPE = "lapsed_client";
const LAPSED_MONTHS = 9;

type LapsedClient = { id: string; company_name: string; last_requisition_at: string };

function useLapsedClients(recruiterId: string) {
  return useQuery({
    queryKey: ["clients", recruiterId, "lapsed"],
    queryFn: async () => {
      const { data: clients, error: clientErr } = await supabase
        .from("clients")
        .select("id, company_name")
        .eq("recruiter_id", recruiterId);
      if (clientErr) throw clientErr;
      const clientIds = (clients ?? []).map((c) => c.id);
      if (clientIds.length === 0) return [];

      const { data: reqs, error: reqErr } = await supabase
        .from("requisitions")
        .select("client_id, created_at, is_open")
        .in("client_id", clientIds);
      if (reqErr) throw reqErr;

      const byClient = new Map<string, { lastCreated: string; hasOpen: boolean }>();
      for (const r of reqs ?? []) {
        const existing = byClient.get(r.client_id);
        const hasOpen = (existing?.hasOpen ?? false) || r.is_open;
        const lastCreated = !existing || r.created_at > existing.lastCreated ? r.created_at : existing.lastCreated;
        byClient.set(r.client_id, { lastCreated, hasOpen });
      }

      const cutoff = Date.now() - LAPSED_MONTHS * 30 * 86_400_000;
      const result: LapsedClient[] = [];
      for (const c of clients ?? []) {
        const info = byClient.get(c.id);
        if (!info || info.hasOpen) continue;
        if (new Date(info.lastCreated).getTime() > cutoff) continue;
        result.push({ id: c.id, company_name: c.company_name, last_requisition_at: info.lastCreated });
      }
      return result.sort((a, b) => a.last_requisition_at.localeCompare(b.last_requisition_at));
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function LapsedClientCard({ recruiterId }: { recruiterId: string }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const { data: clients = [], isLoading } = useLapsedClients(recruiterId);
  const { data: stateRows = [] } = usePriorityActionState(recruiterId);
  const upsertState = useUpsertPriorityActionState(recruiterId);
  const deleteState = useDeletePriorityActionState(recruiterId);

  const stateByKey = useMemo(() => {
    const map = new Map<string, PriorityActionStateRow>();
    for (const row of stateRows) map.set(stateKey(row.entity_id, row.action_type), row);
    return map;
  }, [stateRows]);

  const items = clients.filter((c) => isVisible(stateByKey, c.id, ACTION_TYPE));
  const visible = showAll ? items : items.slice(0, 8);
  const hiddenCount = items.length - visible.length;

  function handleDone(clientId: string) {
    upsertState.mutate({ entity_type: "client", entity_id: clientId, action_type: ACTION_TYPE, status: "done", effective_date: todayStr() });
    toast("Cleared for today.", {
      action: { label: "Undo", onClick: () => deleteState.mutate({ entityId: clientId, actionType: ACTION_TYPE }) },
      duration: 6000,
    });
  }

  function handleSnooze(clientId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    upsertState.mutate({ entity_type: "client", entity_id: clientId, action_type: ACTION_TYPE, status: "snoozed", effective_date: tomorrow.toISOString().slice(0, 10) });
    toast("Snoozed until tomorrow.", {
      action: { label: "Undo", onClick: () => deleteState.mutate({ entityId: clientId, actionType: ACTION_TYPE }) },
      duration: 6000,
    });
  }

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <IconBuildingWarehouse size={14} style={{ color: "var(--color-ink-60)" }} />
        <span className="text-[12px] font-medium">Lapsed clients — worth a win-back call</span>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          No lapsed clients right now.
        </div>
      ) : (
        <>
          <div>
            {visible.map((c) => (
              <div key={c.id} className="w-full flex items-stretch" style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}>
                <button
                  onClick={() => void navigate({ to: "/clients/$id", params: { id: c.id } })}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-ink-10)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{c.company_name}</p>
                    <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
                      Last requisition {relativeTime(c.last_requisition_at)}, none open since
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
            <button onClick={() => setShowAll(true)} className="w-full px-4 py-2 text-[12px] text-center" style={{ color: "var(--color-indigo)" }}>
              Show {hiddenCount} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
