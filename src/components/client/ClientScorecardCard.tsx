import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconChartBar } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { formatYen } from "@/lib/candidate-utils";
import { SectionLabel } from "@/components/shared/SectionLabel";

// Below this many terminal outcomes (Placed + Closed lost combined), a rate
// or average would be reading a pattern into 1-2 data points. Show the raw
// count instead of a computed percentage/average until this is met.
const MIN_SAMPLE = 3;

const CLOSED_REASON_LABELS: Record<string, string> = {
  client_rejected: "Client passed",
  candidate_withdrew: "Candidate withdrew",
  counteroffer: "Counteroffer",
  competing_offer: "Competing offer",
  salary_mismatch: "Comp gap",
  client_cancelled_role: "Role cancelled",
  no_response: "Went cold",
  other: "Other",
  uncategorized: "Uncategorized",
};

type ProcessRow = {
  id: string;
  stage: string;
  placed_fee_jpy: number | null;
  placed_date: string | null;
  cv_sent_at: string | null;
  closed_reason_category: string | null;
  ccm_outcome: string | null;
  requisitions: {
    hiring_manager_id: string | null;
    client_contacts: { id: string; name: string } | null;
  } | null;
};

type OutcomeBucket = {
  placed: ProcessRow[];
  closedLost: ProcessRow[];
  ccmPass: number;
  ccmFail: number;
};

function bucket(rows: ProcessRow[]): OutcomeBucket {
  return {
    placed: rows.filter((r) => r.stage === "Placed"),
    closedLost: rows.filter((r) => r.stage === "Closed lost"),
    ccmPass: rows.filter((r) => r.ccm_outcome === "pass").length,
    ccmFail: rows.filter((r) => r.ccm_outcome === "fail").length,
  };
}

function avgFeeAndCycle(placed: ProcessRow[]) {
  const withFee = placed.filter((p) => p.placed_fee_jpy != null);
  const totalFee = withFee.reduce((sum, p) => sum + (p.placed_fee_jpy ?? 0), 0);
  const withCycle = placed.filter((p) => p.cv_sent_at && p.placed_date);
  const avgDays =
    withCycle.length > 0
      ? Math.round(
          withCycle.reduce((sum, p) => {
            const days =
              (new Date(p.placed_date!).getTime() - new Date(p.cv_sent_at!).getTime()) / 86_400_000;
            return sum + days;
          }, 0) / withCycle.length,
        )
      : null;
  return { totalFee, withFeeCount: withFee.length, avgFee: withFee.length > 0 ? totalFee / withFee.length : null, avgDays };
}

function closedReasonCounts(closedLost: ProcessRow[]) {
  const counts = new Map<string, number>();
  for (const p of closedLost) {
    const key = p.closed_reason_category ?? "uncategorized";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function useClientScorecard(clientId: string) {
  return useQuery({
    queryKey: ["clients", clientId, "scorecard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select(
          "id, stage, placed_fee_jpy, placed_date, cv_sent_at, closed_reason_category, ccm_outcome, requisitions!inner(hiring_manager_id, client_contacts(id, name))",
        )
        .eq("requisitions.client_id", clientId);
      if (error) throw error;
      return (data ?? []) as unknown as ProcessRow[];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function ClientScorecardCard({ clientId }: { clientId: string }) {
  const [expanded, setExpanded] = useState(true);
  const { data: rows, isLoading } = useClientScorecard(clientId);

  if (isLoading || !rows) return null;

  const overall = bucket(rows);
  const terminalCount = overall.placed.length + overall.closedLost.length;

  const hmMap = new Map<string, { name: string; rows: ProcessRow[] }>();
  for (const row of rows) {
    const hmId = row.requisitions?.hiring_manager_id;
    const hmName = row.requisitions?.client_contacts?.name;
    if (!hmId || !hmName) continue;
    if (!hmMap.has(hmId)) hmMap.set(hmId, { name: hmName, rows: [] });
    hmMap.get(hmId)!.rows.push(row);
  }
  const byHm = [...hmMap.values()]
    .map(({ name, rows: hmRows }) => ({ name, ...bucket(hmRows) }))
    .filter((hm) => hm.placed.length + hm.closedLost.length > 0);

  const { totalFee, avgFee, avgDays } = avgFeeAndCycle(overall.placed);
  const reasonCounts = closedReasonCounts(overall.closedLost);
  const ccmTotal = overall.ccmPass + overall.ccmFail;

  return (
    <div
      className="overflow-hidden"
      style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
    >
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <IconChartBar size={13} style={{ color: "var(--color-ink-30)" }} />
        <span className="flex-1 text-[12px] font-medium" style={{ color: "var(--color-ink-60)" }}>
          Track record
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {terminalCount === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
              No placements or closed processes yet for this client.
            </p>
          ) : (
            <>
              <div>
                <SectionLabel>Overall</SectionLabel>
                <div className="flex gap-4 text-[13px]" style={{ color: "var(--color-ink)" }}>
                  <span><b>{overall.placed.length}</b> placed</span>
                  <span><b>{overall.closedLost.length}</b> closed lost</span>
                </div>
                {overall.placed.length > 0 && (
                  <p className="text-[12px] mt-1" style={{ color: "var(--color-ink-60)" }}>
                    {formatYen(totalFee)} in fees
                    {avgFee != null && overall.placed.length >= MIN_SAMPLE
                      ? ` · avg ${formatYen(Math.round(avgFee))} per placement`
                      : ""}
                    {avgDays != null && overall.placed.length >= MIN_SAMPLE ? ` · avg ${avgDays}d to fill` : ""}
                  </p>
                )}
              </div>

              {overall.closedLost.length > 0 && (
                <div>
                  <SectionLabel>Closed lost</SectionLabel>
                  {overall.closedLost.length < MIN_SAMPLE ? (
                    <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                      {overall.closedLost.length} closed lost so far — not enough yet to show a pattern.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {reasonCounts.map(([category, count]) => (
                        <div key={category} className="flex justify-between text-[12px]">
                          <span style={{ color: "var(--color-ink-60)" }}>
                            {CLOSED_REASON_LABELS[category] ?? category}
                          </span>
                          <span style={{ color: "var(--color-ink)" }}>
                            {count} · {Math.round((count / overall.closedLost.length) * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {ccmTotal > 0 && (
                <div>
                  <SectionLabel>Interview outcomes</SectionLabel>
                  {ccmTotal < MIN_SAMPLE ? (
                    <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                      {ccmTotal} recorded so far — not enough yet to show a pass rate.
                    </p>
                  ) : (
                    <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                      {overall.ccmPass} pass / {overall.ccmFail} fail ·{" "}
                      {Math.round((overall.ccmPass / ccmTotal) * 100)}% pass rate
                    </p>
                  )}
                </div>
              )}

              {byHm.length > 0 && (
                <div>
                  <SectionLabel>By hiring manager</SectionLabel>
                  <div className="space-y-2">
                    {byHm.map((hm) => {
                      const hmTerminal = hm.placed.length + hm.closedLost.length;
                      return (
                        <div key={hm.name} className="text-[12px]">
                          <div className="flex justify-between">
                            <span style={{ color: "var(--color-ink)" }}>{hm.name}</span>
                            <span style={{ color: "var(--color-ink-60)" }}>
                              {hm.placed.length} placed · {hm.closedLost.length} closed lost
                            </span>
                          </div>
                          {hmTerminal < MIN_SAMPLE && (
                            <p style={{ color: "var(--color-ink-30)" }}>
                              Not enough history with this hiring manager yet for a pattern.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
