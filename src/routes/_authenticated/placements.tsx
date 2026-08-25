import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { formatYen } from "@/lib/candidate-utils";
import { IconTrophy } from "@tabler/icons-react";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";

// Placements tab — spec given 2026-08-23, built 2026-08-24 once all roadmap
// waves closed (per the user's own instruction not to action it earlier).
// Every placement, candidate name + fee, filterable by all-time / this year /
// this quarter, fees totaled for the selected filter. processes.placed_fee_jpy
// and placed_date already existed and are the only data source here — this
// is a new list view and filter, not new data model.
//
// Team-wide, not scoped to the logged-in recruiter: unlike the dashboard's
// personal priority queue (Section 5), realized placements are exactly the
// kind of shared context the multi-user model exists for, and this list
// doubles as the number a recruiter would show a prospective client.

export const Route = createFileRoute("/_authenticated/placements")({
  component: PlacementsPage,
});

type Placement = {
  id: string;
  placed_date: string | null;
  placed_fee_jpy: number | null;
  candidates: { id: string; full_name: string } | null;
  requisitions: { title: string; clients: { company_name: string } | null } | null;
};

function usePlacements() {
  return useQuery({
    queryKey: ["placements"],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<Placement[]> => {
      const { data, error } = await supabase
        .from("processes")
        .select(
          `id, placed_date, placed_fee_jpy,
           candidates ( id, full_name ),
           requisitions ( title, clients ( company_name ) )`,
        )
        .eq("stage", "Placed")
        .order("placed_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        candidates: Array.isArray(r.candidates) ? (r.candidates[0] ?? null) : r.candidates,
        requisitions: Array.isArray(r.requisitions) ? (r.requisitions[0] ?? null) : r.requisitions,
      })) as Placement[];
    },
  });
}

type PeriodFilter = "all" | "year" | "quarter";

function inPeriod(dateStr: string | null, period: PeriodFilter): boolean {
  if (period === "all") return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  const qOf = (date: Date) => Math.floor(date.getMonth() / 3);
  return d.getFullYear() === now.getFullYear() && qOf(d) === qOf(now);
}

function PlacementsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: placements = [], isLoading } = usePlacements();
  const [period, setPeriod] = useState<PeriodFilter>("all");

  const filtered = useMemo(
    () => placements.filter((p) => inPeriod(p.placed_date, period)),
    [placements, period],
  );

  const totalFees = filtered.reduce((sum, p) => sum + (p.placed_fee_jpy ?? 0), 0);

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: "all", label: t("placements.periodAll") },
    { value: "year", label: t("placements.periodYear") },
    { value: "quarter", label: t("placements.periodQuarter") },
  ];

  return (
    <div className="px-8 py-7 max-w-5xl">
      {/* Header row */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium mb-0.5">{t("nav.placements")}</h1>
          <p className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
            {t("placements.subtitle")}
          </p>
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-3 text-right" style={{ background: "var(--color-moss-light)", border: "0.5px solid rgba(74,94,58,0.3)" }}>
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-0.5" style={{ color: "var(--color-moss)" }}>
              {t("placements.realizedFees")}
            </p>
            <p className="text-[22px] font-medium leading-none" style={{ color: "var(--color-moss)" }}>
              {formatYen(totalFees)}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-moss)" }}>
              {t("placements.placementCount", { count: filtered.length })}
            </p>
          </div>
        )}
      </div>

      {/* Period filter */}
      <div className="flex mb-5" style={{ border: "0.5px solid var(--color-ink-15)", width: "fit-content" }}>
        {periodOptions.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className="px-3.5 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              background: period === opt.value ? "var(--color-ink)" : "transparent",
              color: period === opt.value ? "var(--color-white)" : "var(--color-ink-60)",
              borderLeft: i > 0 ? "0.5px solid var(--color-ink-15)" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-10 text-center text-sm" style={{ color: "var(--color-ink-30)" }}>
          {t("common.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <IconTrophy size={28} style={{ color: "var(--color-ink-15)", margin: "0 auto 10px" }} />
          <p className="text-sm font-medium">{t("placements.empty")}</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-60)" }}>
            {t("placements.emptySub")}
          </p>
        </div>
      ) : (
        <div style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-white)" }}>
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => {
                if (p.candidates) {
                  void navigate({ to: "/candidates/$id", params: { id: p.candidates.id }, search: BLANK_CANDIDATE_SEARCH });
                }
              }}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors"
              style={{
                borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-ink-15)" : "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-ink-10)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium truncate">{p.candidates?.full_name ?? t("placements.unknownCandidate")}</p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--color-ink-60)" }}>
                  {p.requisitions?.title ?? "—"} · {p.requisitions?.clients?.company_name ?? "—"}
                </p>
              </div>
              <div className="text-right shrink-0 pl-4">
                <p className="text-[14px] font-medium" style={{ color: "var(--color-moss)" }}>
                  {formatYen(p.placed_fee_jpy)}
                </p>
                <p className="text-[11px] mt-0.5 font-mono" style={{ color: "var(--color-ink-30)" }}>
                  {p.placed_date ?? "—"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
