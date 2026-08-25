import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { IconBriefcase, IconCheck, IconBellOff } from "@tabler/icons-react";
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

const ACTION_TYPE = "job_change_signal";
const INITIAL_VISIBLE = 8;

type PlacedCandidate = {
  id: string;
  full_name: string;
  full_name_japanese: string | null;
  email: string | null;
  placed_date: string | null;
  original_client: string;
};

type Signal = {
  candidateId: string;
  candidateName: string;
  originalClient: string;
  placedDate: string | null;
  newClient: string;
  contactName: string;
  contactTitle: string | null;
  confidence: "high" | "medium";
};

// Placed candidates for this recruiter, matched against this team's
// client_contacts by email or name. Zero real overlap exists in most
// databases today — this is a discovery signal, not an active-process rule,
// so it lives in its own card rather than the ranked priority queue (same
// separation CandidateReengagementCard already established).
function useJobChangeSignals(recruiterId: string) {
  return useQuery({
    queryKey: ["job-change-signals", recruiterId],
    queryFn: async (): Promise<Signal[]> => {
      const { data: placedRows, error: placedError } = await supabase
        .from("processes")
        .select("candidate_id, placed_date, candidates(id, full_name, full_name_japanese, email), requisitions(clients(company_name))")
        .eq("owner_recruiter_id", recruiterId)
        .eq("stage", "Placed");
      if (placedError) throw placedError;

      const placed: PlacedCandidate[] = (placedRows ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => {
          const cand = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates;
          const req = Array.isArray(row.requisitions) ? row.requisitions[0] : row.requisitions;
          const cli = req?.clients ? (Array.isArray(req.clients) ? req.clients[0] : req.clients) : null;
          if (!cand) return null;
          return {
            id: cand.id,
            full_name: cand.full_name,
            full_name_japanese: cand.full_name_japanese ?? null,
            email: cand.email ?? null,
            placed_date: row.placed_date ?? null,
            original_client: cli?.company_name ?? "—",
          };
        })
        .filter((p: PlacedCandidate | null): p is PlacedCandidate => p !== null);

      if (placed.length === 0) return [];

      // client_contacts carries no team_id of its own — it's scoped via
      // client_id -> clients.team_id, same as match-sender.ts. This is
      // deliberately team-wide (not just this recruiter's own contacts):
      // the whole point is surfacing a placed candidate who now appears as
      // *anyone's* contact, matching the multi-user visibility model.
      const { data: recruiter, error: recruiterError } = await supabase
        .from("recruiters")
        .select("team_id")
        .eq("id", recruiterId)
        .single();
      if (recruiterError) throw recruiterError;

      const { data: contacts, error: contactError } = await supabase
        .from("client_contacts")
        .select("name, email, title, clients!inner(company_name, team_id)")
        .eq("clients.team_id", recruiter.team_id);
      if (contactError) throw contactError;
      return matchSignals(placed, contacts ?? []);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchSignals(placed: PlacedCandidate[], contacts: any[]): Signal[] {
  const signals: Signal[] = [];
  for (const contact of contacts) {
    const cli = Array.isArray(contact.clients) ? contact.clients[0] : contact.clients;
    const contactEmail = (contact.email ?? "").trim().toLowerCase();
    const contactName = (contact.name ?? "").trim().toLowerCase();
    for (const cand of placed) {
      const candEmail = (cand.email ?? "").trim().toLowerCase();
      const emailMatch = candEmail && contactEmail && candEmail === contactEmail;
      const nameMatch =
        !emailMatch &&
        contactName &&
        [cand.full_name, cand.full_name_japanese].some((n) => (n ?? "").trim().toLowerCase() === contactName);
      if (emailMatch || nameMatch) {
        signals.push({
          candidateId: cand.id,
          candidateName: cand.full_name,
          originalClient: cand.original_client,
          placedDate: cand.placed_date,
          newClient: cli?.company_name ?? "—",
          contactName: contact.name,
          contactTitle: contact.title ?? null,
          confidence: emailMatch ? "high" : "medium",
        });
      }
    }
  }
  return signals;
}

export function JobChangeSignalCard({ recruiterId }: { recruiterId: string }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const { data: signals = [], isLoading } = useJobChangeSignals(recruiterId);
  const { data: stateRows = [] } = usePriorityActionState(recruiterId);
  const upsertState = useUpsertPriorityActionState(recruiterId);
  const deleteState = useDeletePriorityActionState(recruiterId);

  const stateByKey = useMemo(() => {
    const map = new Map<string, PriorityActionStateRow>();
    for (const row of stateRows) map.set(stateKey(row.entity_id, row.action_type), row);
    return map;
  }, [stateRows]);

  const items = signals.filter((s) => isVisible(stateByKey, s.candidateId, ACTION_TYPE));
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
        <IconBriefcase size={14} style={{ color: "var(--color-ink-60)" }} />
        <span className="text-[12px] font-medium">Job-change signals</span>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          No matches between placed candidates and client contacts right now.
        </div>
      ) : (
        <>
          <div>
            {visible.map((s) => (
              <div
                key={s.candidateId}
                className="w-full flex items-stretch"
                style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
              >
                <button
                  onClick={() => void navigate({ to: "/candidates/$id", params: { id: s.candidateId }, search: BLANK_CANDIDATE_SEARCH })}
                  className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-ink-10)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{s.candidateName}</p>
                    <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
                      Placed at {s.originalClient}{s.placedDate ? ` ${relativeTime(s.placedDate)}` : ""} — now matches {s.contactName}
                      {s.contactTitle ? `, ${s.contactTitle}` : ""} at {s.newClient}
                      {s.confidence === "medium" ? " (name match, not confirmed)" : ""}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => handleDone(s.candidateId)}
                  className="flex items-center justify-center w-9 transition-colors hover:bg-[--color-moss-light]"
                  title="Clear for today"
                >
                  <IconCheck size={12} style={{ color: "var(--color-ink-30)" }} />
                </button>
                <button
                  onClick={() => handleSnooze(s.candidateId)}
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
