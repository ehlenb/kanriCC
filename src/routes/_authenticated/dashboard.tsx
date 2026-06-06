import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import { greetingByHour, todayFormatted, relativeTime } from "@/lib/candidate-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronRight, IconAlertTriangle, IconSparkles, IconCheck, IconBellOff, IconBriefcase } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// ─── agenda localStorage ─────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

function getDoneToday(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("kanri_done_today") ?? "{}") as Record<string, string>; }
  catch { return {}; }
}
function getSnoozed(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("kanri_snoozed") ?? "{}") as Record<string, string>; }
  catch { return {}; }
}
function markDoneToday(entityId: string) {
  const d = getDoneToday(); d[entityId] = TODAY;
  localStorage.setItem("kanri_done_today", JSON.stringify(d));
}
function snoozeUntil(entityId: string, date: string) {
  const d = getSnoozed(); d[entityId] = date;
  localStorage.setItem("kanri_snoozed", JSON.stringify(d));
}
function isVisible(entityId: string): boolean {
  if (getDoneToday()[entityId] === TODAY) return false;
  const snoozeDate = getSnoozed()[entityId];
  return !(snoozeDate && snoozeDate > TODAY);
}

// ─── types ───────────────────────────────────────────────────────────────────

type AgendaItem = {
  entity_type: "candidate" | "client" | "requisition";
  entity_id: string;
  entity_name: string;
  process_id?: string;
  stage?: string;
  reason: string;
  suggested_action: string;
  action_type: string;
  priority_rank: number;
};

type MetricKey = "specs" | "cvs" | "interviewing" | "offers" | "placed";
type Period = "week" | "30d" | "month" | "quarter" | "all";

type SpecItem = {
  id: string;
  candidate_name: string | null;
  client_name: string | null;
  summary: string | null;
  interacted_at: string;
};

type ProcessRow = {
  id: string;
  stage: string;
  cv_sent_at: string | null;
  offer_date: string | null;
  placed_date: string | null;
  placed_fee_jpy: number | null;
  candidate_id: string;
  candidate_name: string;
  company_name: string;
  role_title: string;
};

type CompetingAlert = {
  candidate_id: string;
  candidate_name: string;
  full_name_japanese: string | null;
  my_stage: string;
  company_name: string;
  role_title: string;
  competing: { company_name: string; stage: string | null; disclosed_at: string | null }[];
  urgency: "critical" | "high" | "medium";
};

type AnalysisState = { loading: boolean; text: string | null };

// ─── period helpers ───────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "week",    label: "This Week" },
  { value: "30d",     label: "Last 30 Days" },
  { value: "month",   label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "all",     label: "All Time" },
];

function getWeekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d;
}

function fromTimestamp(period: Period): string | null {
  const now = new Date();
  switch (period) {
    case "week":    return getWeekStart().toISOString();
    case "30d":     return new Date(now.getTime() - 30 * 86400000).toISOString();
    case "month":   return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    case "quarter": return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
    case "all":     return null;
  }
}

function fromDateStr(period: Period): string | null {
  const ts = fromTimestamp(period);
  return ts ? ts.slice(0, 10) : null;
}

function formatFee(jpy: number | null): string {
  if (!jpy) return "—";
  return `¥${(jpy / 1_000_000).toFixed(1)}M`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── urgency helpers ──────────────────────────────────────────────────────────

function computeUrgency(
  myStage: string,
  competing: { stage: string | null }[],
): "critical" | "high" | "medium" {
  const ext = competing.map((c) => (c.stage ?? "").toLowerCase());
  const hasOffer = ext.some((s) => s.includes("offer") || s.includes("final") || s.includes("内定"));
  const hasInterview = ext.some((s) => s.includes("interview") || s.includes("ccm") || s.includes("面接"));
  if (hasOffer && myStage !== "Offer") return "critical";
  if (hasOffer) return "high";
  if (hasInterview) return "high";
  return "medium";
}

const URGENCY_ORDER = { critical: 2, high: 1, medium: 0 };

// ─── process row normaliser ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseProcessRow(row: any): ProcessRow {
  const cand = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates;
  const req  = Array.isArray(row.requisitions) ? row.requisitions[0] : row.requisitions;
  const cli  = req?.clients ? (Array.isArray(req.clients) ? req.clients[0] : req.clients) : null;
  return {
    id:             row.id,
    stage:          row.stage,
    cv_sent_at:     row.cv_sent_at ?? null,
    offer_date:     row.offer_date ?? null,
    placed_date:    row.placed_date ?? null,
    placed_fee_jpy: row.placed_fee_jpy ?? null,
    candidate_id:   (cand as { id?: string } | null)?.id ?? "",
    candidate_name: (cand as { full_name?: string } | null)?.full_name ?? "—",
    company_name:   (cli as { company_name?: string } | null)?.company_name ?? "—",
    role_title:     (req as { title?: string } | null)?.title ?? "—",
  };
}

const PROCESS_SELECT =
  "id, stage, cv_sent_at, offer_date, placed_date, placed_fee_jpy, candidate_id, candidates(id, full_name), requisitions(title, clients(company_name))";

// ─── agenda hook ─────────────────────────────────────────────────────────────

function useDailyAgenda(recruiterId: string) {
  return useQuery({
    queryKey: ["dashboard", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<AgendaItem[]> => {
      const resp = await fetch("/api/ai/daily-agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recruiter_id: recruiterId }),
      });
      const data = (await resp.json()) as { agenda?: AgendaItem[] };
      return data.agenda ?? [];
    },
  });
}

// ─── data hooks ──────────────────────────────────────────────────────────────

function useWeeklyMetrics(recruiterId: string) {
  const weekStart = getWeekStart().toISOString();
  const weekDate  = getWeekStart().toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["dashboard-metrics", recruiterId, weekStart],
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const [
        { count: specsCount },
        { count: cvsCount },
        { data: activeProcesses },
      ] = await Promise.all([
        supabase
          .from("interactions")
          .select("id", { count: "exact", head: true })
          .eq("recruiter_id", recruiterId)
          .eq("interaction_type", "job spec sent")
          .gte("interacted_at", weekStart),
        supabase
          .from("processes")
          .select("id", { count: "exact", head: true })
          .eq("owner_recruiter_id", recruiterId)
          .gte("cv_sent_at", weekStart),
        supabase
          .from("processes")
          .select("stage, placed_date, placed_fee_jpy")
          .eq("owner_recruiter_id", recruiterId)
          .not("stage", "in", '("Closed lost")'),
      ]);

      const all = activeProcesses ?? [];
      const interviewing = all.filter((p) => /^CCM\d+$/.test(p.stage)).length;
      const offers       = all.filter((p) => p.stage === "Offer").length;
      const placedWeek   = all.filter((p) => p.stage === "Placed" && (p.placed_date ?? "") >= weekDate);
      const placedCount  = placedWeek.length;
      const placedFee    = placedWeek.reduce((sum, p) => sum + (p.placed_fee_jpy ?? 0), 0);

      return {
        specs:        specsCount ?? 0,
        cvs:          cvsCount ?? 0,
        interviewing,
        offers,
        placedCount,
        placedFee,
      };
    },
  });
}

function useSpecsDetail(recruiterId: string, from: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["specs-detail", recruiterId, from],
    staleTime: 30_000,
    retry: 1,
    enabled,
    queryFn: async (): Promise<SpecItem[]> => {
      let q = supabase
        .from("interactions")
        .select("id, summary, interacted_at, candidates(full_name), clients(company_name)")
        .eq("recruiter_id", recruiterId)
        .eq("interaction_type", "job spec sent")
        .order("interacted_at", { ascending: false });
      if (from) q = q.gte("interacted_at", from);
      const { data } = await q;
      return (data ?? []).map((r) => {
        const cand = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates;
        const cli  = Array.isArray(r.clients)    ? r.clients[0]    : r.clients;
        return {
          id:             r.id,
          candidate_name: (cand as { full_name?: string } | null)?.full_name ?? null,
          client_name:    (cli as { company_name?: string } | null)?.company_name ?? null,
          summary:        r.summary,
          interacted_at:  r.interacted_at,
        };
      });
    },
  });
}

function useCvsDetail(recruiterId: string, from: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["cvs-detail", recruiterId, from],
    staleTime: 30_000,
    retry: 1,
    enabled,
    queryFn: async (): Promise<ProcessRow[]> => {
      let q = supabase
        .from("processes")
        .select(PROCESS_SELECT)
        .eq("owner_recruiter_id", recruiterId)
        .not("cv_sent_at", "is", null)
        .order("cv_sent_at", { ascending: false });
      if (from) q = q.gte("cv_sent_at", from);
      const { data } = await q;
      return (data ?? []).map(normaliseProcessRow);
    },
  });
}

function useInterviewingDetail(recruiterId: string, from: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["interviewing-detail", recruiterId, from],
    staleTime: 30_000,
    retry: 1,
    enabled,
    queryFn: async (): Promise<ProcessRow[]> => {
      let q = supabase
        .from("processes")
        .select(PROCESS_SELECT)
        .eq("owner_recruiter_id", recruiterId)
        .order("updated_at", { ascending: false });
      if (from) q = q.gte("updated_at", from);
      const { data } = await q;
      return (data ?? [])
        .map(normaliseProcessRow)
        .filter((p) => /^CCM\d+$/.test(p.stage));
    },
  });
}

function useOffersDetail(recruiterId: string, from: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["offers-detail", recruiterId, from],
    staleTime: 30_000,
    retry: 1,
    enabled,
    queryFn: async (): Promise<ProcessRow[]> => {
      let q = supabase
        .from("processes")
        .select(PROCESS_SELECT)
        .eq("owner_recruiter_id", recruiterId)
        .eq("stage", "Offer")
        .order("offer_date", { ascending: false });
      if (from) q = q.gte("offer_date", from);
      const { data } = await q;
      return (data ?? []).map(normaliseProcessRow);
    },
  });
}

function usePlacedDetail(recruiterId: string, from: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["placed-detail", recruiterId, from],
    staleTime: 30_000,
    retry: 1,
    enabled,
    queryFn: async (): Promise<ProcessRow[]> => {
      let q = supabase
        .from("processes")
        .select(PROCESS_SELECT)
        .eq("owner_recruiter_id", recruiterId)
        .eq("stage", "Placed")
        .order("placed_date", { ascending: false });
      if (from) q = q.gte("placed_date", from);
      const { data } = await q;
      return (data ?? []).map(normaliseProcessRow);
    },
  });
}

function useCompetingAlerts(recruiterId: string) {
  return useQuery({
    queryKey: ["competing-alerts", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<CompetingAlert[]> => {
      // Fetch all active non-closed processes
      const { data: procs } = await supabase
        .from("processes")
        .select(
          "id, stage, candidate_id, candidates(id, full_name, full_name_japanese), requisitions(title, clients(company_name))",
        )
        .eq("owner_recruiter_id", recruiterId)
        .not("stage", "in", '("Closed lost","Placed")');

      if (!procs?.length) return [];

      // Filter to CCM + Offer stages
      const activeCcmOffer = procs.filter(
        (p) => /^CCM\d+$/.test(p.stage) || p.stage === "Offer",
      );
      if (!activeCcmOffer.length) return [];

      const candidateIds = [...new Set(activeCcmOffer.map((p) => p.candidate_id as string))];

      // Fetch competing interviews for those candidates
      const { data: competing } = await supabase
        .from("competing_interviews")
        .select("candidate_id, company_name, stage, disclosed_at")
        .in("candidate_id", candidateIds);

      if (!competing?.length) return [];

      // Group competing by candidate_id
      const compMap: Record<string, typeof competing> = {};
      for (const c of competing) {
        const cid = c.candidate_id as string;
        if (!compMap[cid]) compMap[cid] = [];
        compMap[cid].push(c);
      }

      const seen = new Set<string>();
      const alerts: CompetingAlert[] = [];

      for (const proc of activeCcmOffer) {
        const cid = proc.candidate_id as string;
        if (seen.has(cid) || !compMap[cid]?.length) continue;
        seen.add(cid);

        const cand = Array.isArray(proc.candidates) ? proc.candidates[0] : proc.candidates;
        const req  = Array.isArray(proc.requisitions) ? proc.requisitions[0] : proc.requisitions;
        const cli  = req?.clients ? (Array.isArray(req.clients) ? req.clients[0] : req.clients) : null;

        alerts.push({
          candidate_id:      cid,
          candidate_name:    (cand as { full_name?: string } | null)?.full_name ?? "—",
          full_name_japanese:(cand as { full_name_japanese?: string } | null)?.full_name_japanese ?? null,
          my_stage:          proc.stage,
          company_name:      (cli as { company_name?: string } | null)?.company_name ?? "—",
          role_title:        (req as { title?: string } | null)?.title ?? "—",
          competing:         compMap[cid],
          urgency:           computeUrgency(proc.stage, compMap[cid]),
        });
      }

      return alerts.sort(
        (a, b) => URGENCY_ORDER[b.urgency] - URGENCY_ORDER[a.urgency],
      );
    },
  });
}

// ─── dashboard component ──────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const recruiterId = user!.id;
  const navigate = useNavigate();

  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [showAllAgenda, setShowAllAgenda] = useState(false);

  const metrics = useWeeklyMetrics(recruiterId);
  const agenda = useDailyAgenda(recruiterId);

  useEffect(() => {
    if (agenda.data) {
      setAgendaItems(agenda.data.filter((item) => isVisible(item.entity_id)));
    }
  }, [agenda.data]);

  function handleDone(entityId: string) {
    markDoneToday(entityId);
    setAgendaItems((prev) => prev.filter((i) => i.entity_id !== entityId));
  }
  function handleSnooze(entityId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    snoozeUntil(entityId, tomorrow.toISOString().slice(0, 10));
    setAgendaItems((prev) => prev.filter((i) => i.entity_id !== entityId));
  }
  const m = metrics.data;

  const METRIC_CONFIG: {
    key: MetricKey;
    label: string;
    value: number | string;
    sublabel: string;
  }[] = [
    { key: "specs",        label: "Job Specs Sent",  value: m?.specs        ?? "—", sublabel: "this week" },
    { key: "cvs",          label: "CVs Sent",         value: m?.cvs          ?? "—", sublabel: "this week" },
    { key: "interviewing", label: "Interviewing",     value: m?.interviewing ?? "—", sublabel: "active now" },
    { key: "offers",       label: "Offers",           value: m?.offers       ?? "—", sublabel: "active now" },
    {
      key: "placed",
      label: "Placed",
      value: m ? (m.placedFee > 0 ? formatFee(m.placedFee) : m.placedCount) : "—",
      sublabel: "this week",
    },
  ];

  const numColor = (key: MetricKey) =>
    key === "interviewing" ? "var(--color-indigo)" :
    key === "offers"       ? "var(--color-gold)" :
    key === "placed"       ? "var(--color-moss)" :
    "var(--color-ink)";

  return (
    <div className="px-8 py-7 max-w-5xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-medium mb-0.5 font-display">{greetingByHour()}</h1>
        <p className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
          {todayFormatted()}&nbsp;&middot;&nbsp;Week resets every Sunday
        </p>
      </div>

      {/* Priority actions */}
      <PrioritySection
        items={agendaItems}
        isLoading={agenda.isLoading}
        showAll={showAllAgenda}
        onToggleShowAll={() => setShowAllAgenda((v) => !v)}
        onDone={handleDone}
        onSnooze={handleSnooze}
        onNavigate={(item) => {
          if (item.entity_type === "candidate" || item.entity_type === "requisition") {
            void navigate({ to: "/candidates/$id", params: { id: item.entity_id }, search: BLANK_CANDIDATE_SEARCH });
          } else {
            void navigate({ to: "/clients/$id", params: { id: item.entity_id } });
          }
        }}
      />

      {/* Metric strip */}
      <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
        <div className="grid grid-cols-5">
          {METRIC_CONFIG.map((cfg, i) => {
            const isActive = activeMetric === cfg.key;
            return (
              <button
                key={cfg.key}
                onClick={() => setActiveMetric(isActive ? null : cfg.key)}
                className="flex flex-col items-start px-5 py-4 text-left transition-colors"
                style={{
                  background: isActive ? "var(--color-ink)" : "var(--color-white)",
                  borderRight: i < 4 ? "0.5px solid var(--color-ink-15)" : "none",
                  outline: "none",
                }}
              >
                <span
                  className="text-3xl font-display font-semibold leading-none"
                  style={{ color: isActive ? "var(--color-white)" : numColor(cfg.key) }}
                >
                  {metrics.isLoading ? "—" : cfg.value}
                </span>
                <span
                  className="mt-1.5 text-[12px] font-medium leading-tight"
                  style={{ color: isActive ? "rgba(253,252,250,0.75)" : "var(--color-ink)" }}
                >
                  {cfg.label}
                </span>
                <span
                  className="mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase"
                  style={{ color: isActive ? "rgba(253,252,250,0.4)" : "var(--color-ink-30)" }}
                >
                  {cfg.sublabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        {activeMetric && (
          <div style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
            <DetailPanel
              metric={activeMetric}
              recruiterId={recruiterId}
              period={period}
              onPeriodChange={setPeriod}
              onNavigate={(id) =>
                void navigate({ to: "/candidates/$id", params: { id }, search: BLANK_CANDIDATE_SEARCH })
              }
            />
          </div>
        )}
      </div>

      {/* Competing interviews section */}
      <CompetingSection recruiterId={recruiterId} />
    </div>
  );
}

// ─── detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  metric,
  recruiterId,
  period,
  onPeriodChange,
  onNavigate,
}: {
  metric: MetricKey;
  recruiterId: string;
  period: Period;
  onPeriodChange: (p: Period) => void;
  onNavigate: (candidateId: string) => void;
}) {
  const from = fromTimestamp(period);
  const fromDate = fromDateStr(period);

  const specs       = useSpecsDetail(recruiterId, from, metric === "specs");
  const cvs         = useCvsDetail(recruiterId, from, metric === "cvs");
  const interviewing= useInterviewingDetail(recruiterId, from, metric === "interviewing");
  const offers      = useOffersDetail(recruiterId, from, metric === "offers");
  const placed      = usePlacedDetail(recruiterId, fromDate, metric === "placed");

  const isLoading =
    (metric === "specs"        && specs.isLoading) ||
    (metric === "cvs"          && cvs.isLoading) ||
    (metric === "interviewing" && interviewing.isLoading) ||
    (metric === "offers"       && offers.isLoading) ||
    (metric === "placed"       && placed.isLoading);

  return (
    <div className="bg-[--color-white]">
      {/* Panel header with period filter */}
      <div
        className="flex items-center justify-between px-5 py-2.5"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>
          Filter by period
        </span>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPeriodChange(opt.value)}
              className="px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: period === opt.value ? "var(--color-ink)" : "transparent",
                color: period === opt.value ? "var(--color-white)" : "var(--color-ink-60)",
                outline: "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel body */}
      {isLoading ? (
        <div className="px-5 py-4 space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <>
          {metric === "specs" && (
            <SpecsTable items={specs.data ?? []} />
          )}
          {metric === "cvs" && (
            <ProcessTable items={cvs.data ?? []} dateCol="cv_sent_at" dateLabel="CV Sent" onNavigate={onNavigate} />
          )}
          {metric === "interviewing" && (
            <InterviewingTable items={interviewing.data ?? []} onNavigate={onNavigate} />
          )}
          {metric === "offers" && (
            <ProcessTable items={offers.data ?? []} dateCol="offer_date" dateLabel="Offer Date" onNavigate={onNavigate} />
          )}
          {metric === "placed" && (
            <PlacedTable items={placed.data ?? []} onNavigate={onNavigate} />
          )}
        </>
      )}
    </div>
  );
}

// ─── detail tables ─────────────────────────────────────────────────────────────

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-5 py-6 text-center">
      <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>{message}</p>
    </div>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div
      className="grid px-5 py-2"
      style={{
        gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
        borderBottom: "0.5px solid var(--color-ink-15)",
        background: "var(--color-ink-10)",
      }}
    >
      {cols.map((c) => (
        <span key={c} className="font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: "var(--color-ink-30)" }}>
          {c}
        </span>
      ))}
    </div>
  );
}

function SpecsTable({ items }: { items: SpecItem[] }) {
  if (!items.length) return <EmptyRow message="No job specs sent in this period." />;
  return (
    <div>
      <TableHeader cols={["Candidate", "Client", "Summary", "Date"]} />
      {items.map((item) => (
        <div
          key={item.id}
          className="grid px-5 py-3 text-[13px]"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            borderBottom: "0.5px solid var(--color-border-subtle)",
          }}
        >
          <span>{item.candidate_name ?? "—"}</span>
          <span style={{ color: "var(--color-ink-60)" }}>{item.client_name ?? "—"}</span>
          <span className="truncate pr-4" style={{ color: "var(--color-ink-60)" }}>{item.summary ?? "—"}</span>
          <span className="font-mono text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            {relativeTime(item.interacted_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProcessTable({
  items,
  dateCol,
  dateLabel,
  onNavigate,
}: {
  items: ProcessRow[];
  dateCol: "cv_sent_at" | "offer_date";
  dateLabel: string;
  onNavigate: (id: string) => void;
}) {
  if (!items.length) return <EmptyRow message="No entries for this period." />;
  return (
    <div>
      <TableHeader cols={["Candidate", "Company", "Role", dateLabel]} />
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.candidate_id)}
          className="grid w-full px-5 py-3 text-left text-[13px] transition-colors hover:bg-[--color-ink-10]"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            borderBottom: "0.5px solid var(--color-border-subtle)",
            outline: "none",
          }}
        >
          <span className="font-medium">{item.candidate_name}</span>
          <span style={{ color: "var(--color-ink-60)" }}>{item.company_name}</span>
          <span style={{ color: "var(--color-ink-60)" }}>{item.role_title}</span>
          <span className="font-mono text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            {formatDate(item[dateCol])}
          </span>
        </button>
      ))}
    </div>
  );
}

function InterviewingTable({ items, onNavigate }: { items: ProcessRow[]; onNavigate: (id: string) => void }) {
  if (!items.length) return <EmptyRow message="No active interviews." />;

  // Group by stage
  const stages = [...new Set(items.map((i) => i.stage))].sort((a, b) => {
    const na = parseInt(a.replace("CCM", ""), 10);
    const nb = parseInt(b.replace("CCM", ""), 10);
    return na - nb;
  });

  return (
    <div>
      {stages.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage);
        return (
          <div key={stage}>
            <div
              className="px-5 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase"
              style={{
                background: "var(--color-indigo-light)",
                color: "var(--color-indigo)",
                borderBottom: "0.5px solid var(--color-ink-15)",
              }}
            >
              {stage} — {stageItems.length} candidate{stageItems.length !== 1 ? "s" : ""}
            </div>
            {stageItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.candidate_id)}
                className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[--color-ink-10]"
                style={{ borderBottom: "0.5px solid var(--color-border-subtle)", outline: "none" }}
              >
                <span className="text-[13px] font-medium">{item.candidate_name}</span>
                <div className="flex items-center gap-4 text-[13px]" style={{ color: "var(--color-ink-60)" }}>
                  <span>{item.company_name}</span>
                  <span className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>{item.role_title}</span>
                  <IconChevronRight size={14} style={{ color: "var(--color-ink-30)" }} />
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PlacedTable({ items, onNavigate }: { items: ProcessRow[]; onNavigate: (id: string) => void }) {
  if (!items.length) return <EmptyRow message="No placements in this period." />;

  const totalFee = items.reduce((sum, i) => sum + (i.placed_fee_jpy ?? 0), 0);

  return (
    <div>
      <TableHeader cols={["Candidate", "Company", "Role", "Date", "Fee"]} />
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.candidate_id)}
          className="grid w-full px-5 py-3 text-left text-[13px] transition-colors hover:bg-[--color-ink-10]"
          style={{
            gridTemplateColumns: "repeat(5, 1fr)",
            borderBottom: "0.5px solid var(--color-border-subtle)",
            outline: "none",
          }}
        >
          <span className="font-medium">{item.candidate_name}</span>
          <span style={{ color: "var(--color-ink-60)" }}>{item.company_name}</span>
          <span style={{ color: "var(--color-ink-60)" }}>{item.role_title}</span>
          <span className="font-mono text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            {formatDate(item.placed_date)}
          </span>
          <span className="font-mono text-[12px]" style={{ color: "var(--color-moss)" }}>
            {formatFee(item.placed_fee_jpy)}
          </span>
        </button>
      ))}
      {totalFee > 0 && (
        <div
          className="flex items-center justify-end px-5 py-3 gap-2"
          style={{ background: "var(--color-ink-10)", borderTop: "0.5px solid var(--color-ink-15)" }}
        >
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: "var(--color-ink-30)" }}>
            Total
          </span>
          <span className="font-display text-[18px] font-semibold" style={{ color: "var(--color-moss)" }}>
            {formatFee(totalFee)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── priority section ─────────────────────────────────────────────────────────

const STAGE_COLOR: Record<string, string> = {
  Offer:   "var(--color-gold)",
  CCM1:    "var(--color-indigo)",
  CCM2:    "var(--color-indigo)",
  CCM3:    "var(--color-indigo)",
  "Buy-In": "var(--color-ink-30)",
};

function stageBadgeColor(stage: string | undefined): string {
  if (!stage) return "var(--color-ink-30)";
  if (/^CCM\d+$/.test(stage)) return "var(--color-indigo)";
  return STAGE_COLOR[stage] ?? "var(--color-ink-30)";
}

function PrioritySection({
  items,
  isLoading,
  showAll,
  onToggleShowAll,
  onDone,
  onSnooze,
  onNavigate,
}: {
  items: AgendaItem[];
  isLoading: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onDone: (entityId: string) => void;
  onSnooze: (entityId: string) => void;
  onNavigate: (item: AgendaItem) => void;
}) {
  const VISIBLE_COUNT = 5;
  const visible = showAll ? items : items.slice(0, VISIBLE_COUNT);

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>
            Priority actions
          </span>
          {!isLoading && items.length > 0 && (
            <span
              className="font-mono text-[9px] tracking-[0.08em] px-1.5 py-0.5"
              style={{ background: "var(--color-vermillion)", color: "var(--color-white)" }}
            >
              {items.length}
            </span>
          )}
        </div>
        {!isLoading && items.length === 0 && (
          <span className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
            All clear — nothing urgent right now.
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="px-5 py-4 space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {/* Items */}
      {!isLoading && visible.map((item, i) => {
        const isReq = item.entity_type === "requisition";
        const accentColor =
          item.priority_rank <= 3 ? "var(--color-vermillion)" :
          item.priority_rank <= 10 ? "var(--color-gold)" :
          "var(--color-ink-15)";

        return (
          <div
            key={`${item.entity_id}-${i}`}
            className="flex items-stretch"
            style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}
          >
            {/* Priority accent bar + number */}
            <div
              className="flex w-10 shrink-0 flex-col items-center justify-start pt-4 gap-1"
              style={{ background: "var(--color-ink-10)", borderRight: "0.5px solid var(--color-ink-15)" }}
            >
              <span className="font-mono text-[11px] font-medium" style={{ color: accentColor }}>
                {i + 1}
              </span>
            </div>

            {/* Content */}
            <button
              onClick={() => onNavigate(item)}
              className="flex flex-1 flex-col items-start px-4 py-3 text-left transition-colors hover:bg-[--color-ink-10]"
              style={{ outline: "none" }}
            >
              <div className="flex w-full items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {isReq && (
                    <IconBriefcase size={13} style={{ color: "var(--color-gold)", flexShrink: 0 }} />
                  )}
                  <span className="text-[13px] font-medium font-display truncate">{item.entity_name}</span>
                  {item.stage && (
                    <span
                      className="shrink-0 font-mono text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5"
                      style={{ background: stageBadgeColor(item.stage) + "22", color: stageBadgeColor(item.stage) }}
                    >
                      {item.stage}
                    </span>
                  )}
                </div>
                <IconChevronRight size={13} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
              </div>
              <p className="text-[12px] leading-snug" style={{ color: "var(--color-ink-60)" }}>
                {item.reason}
              </p>
              {item.suggested_action && (
                <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--color-ink)" }}>
                  → {item.suggested_action}
                </p>
              )}
            </button>

            {/* Actions */}
            <div
              className="flex shrink-0 flex-col border-l"
              style={{ borderColor: "var(--color-ink-15)" }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onDone(item.entity_id); }}
                title="Mark done for today"
                className="flex flex-1 items-center justify-center w-10 transition-colors hover:bg-[--color-moss-light]"
                style={{ outline: "none", borderBottom: "0.5px solid var(--color-ink-15)" }}
              >
                <IconCheck size={13} style={{ color: "var(--color-ink-30)" }} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSnooze(item.entity_id); }}
                title="Snooze until tomorrow"
                className="flex flex-1 items-center justify-center w-10 transition-colors hover:bg-[--color-gold-light]"
                style={{ outline: "none" }}
              >
                <IconBellOff size={13} style={{ color: "var(--color-ink-30)" }} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Show more / less */}
      {!isLoading && items.length > VISIBLE_COUNT && (
        <button
          onClick={onToggleShowAll}
          className="w-full py-2.5 text-center text-[12px] font-medium transition-colors hover:bg-[--color-ink-10]"
          style={{
            color: "var(--color-ink-60)",
            borderTop: "0.5px solid var(--color-ink-15)",
            outline: "none",
          }}
        >
          {showAll ? "Show less" : `Show ${items.length - VISIBLE_COUNT} more`}
        </button>
      )}
    </div>
  );
}

// ─── competing alerts section ─────────────────────────────────────────────────

function CompetingSection({ recruiterId }: { recruiterId: string }) {
  const q = useCompetingAlerts(recruiterId);
  const [analyses, setAnalyses] = useState<Record<string, AnalysisState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (q.isLoading) return null;
  if (!q.data?.length) return null;

  async function getAnalysis(candidateId: string) {
    setAnalyses((prev) => ({ ...prev, [candidateId]: { loading: true, text: null } }));
    try {
      const resp = await fetch("/api/ai/competing-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, recruiter_id: recruiterId }),
      });
      const json = (await resp.json()) as { analysis?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setAnalyses((prev) => ({ ...prev, [candidateId]: { loading: false, text: json.analysis ?? "" } }));
      setExpanded((prev) => new Set([...prev, candidateId]));
    } catch {
      toast.error("Could not generate competitive analysis. Try again.");
      setAnalyses((prev) => ({ ...prev, [candidateId]: { loading: false, text: null } }));
    }
  }

  const urgencyColor = (u: CompetingAlert["urgency"]) =>
    u === "critical" ? "var(--color-danger)" :
    u === "high"     ? "var(--color-gold)" :
    "var(--color-ink-30)";

  const urgencyLabel = (u: CompetingAlert["urgency"]) =>
    u === "critical" ? "CRITICAL" : u === "high" ? "HIGH RISK" : "WATCH";

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <IconAlertTriangle size={14} style={{ color: "var(--color-gold)" }} />
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>
          Competing interviews — {q.data.length} candidate{q.data.length !== 1 ? "s" : ""} flagged
        </span>
      </div>

      {q.data.map((alert) => {
        const analysis = analyses[alert.candidate_id];
        const isExpanded = expanded.has(alert.candidate_id);

        return (
          <div key={alert.candidate_id} style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}>
            {/* Alert row */}
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                {/* Candidate + urgency */}
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[14px] font-medium font-display">
                    {alert.full_name_japanese
                      ? <>{alert.full_name_japanese} / {alert.candidate_name}</>
                      : alert.candidate_name}
                  </span>
                  <span
                    className="font-mono text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5 border"
                    style={{
                      color: urgencyColor(alert.urgency),
                      borderColor: urgencyColor(alert.urgency),
                      background: alert.urgency === "critical" ? "var(--color-danger-bg)" : "transparent",
                    }}
                  >
                    {urgencyLabel(alert.urgency)}
                  </span>
                </div>

                {/* Your process */}
                <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                  Your process:{" "}
                  <span className="font-medium" style={{ color: "var(--color-indigo)" }}>{alert.my_stage}</span>
                  {" "}at {alert.company_name} — {alert.role_title}
                </p>

                {/* Competing companies */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {alert.competing.map((c, i) => (
                    <span
                      key={i}
                      className="font-mono text-[10px] tracking-[0.06em] px-2 py-0.5 border"
                      style={{
                        color: "var(--color-ink-60)",
                        borderColor: "var(--color-ink-15)",
                        background: "var(--color-ink-10)",
                      }}
                    >
                      {c.company_name}{c.stage ? ` · ${c.stage}` : ""}
                      {c.disclosed_at ? ` · ${formatDate(c.disclosed_at)}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              {/* AI analysis button */}
              <button
                onClick={() => {
                  if (analysis?.text) {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      isExpanded ? next.delete(alert.candidate_id) : next.add(alert.candidate_id);
                      return next;
                    });
                  } else {
                    void getAnalysis(alert.candidate_id);
                  }
                }}
                disabled={analysis?.loading}
                className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors"
                style={{
                  background: "var(--color-ink)",
                  color: "var(--color-white)",
                  outline: "none",
                  opacity: analysis?.loading ? 0.6 : 1,
                }}
              >
                <IconSparkles size={13} />
                {analysis?.loading ? "Analysing…" : analysis?.text ? (isExpanded ? "Hide" : "Show Analysis") : "Get AI Analysis"}
              </button>
            </div>

            {/* Analysis output */}
            {isExpanded && analysis?.text && (
              <div
                className="px-5 pb-5"
                style={{ borderTop: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-05)" }}
              >
                <p className="font-mono text-[10px] tracking-[0.1em] uppercase pt-4 pb-2" style={{ color: "var(--color-ink-30)" }}>
                  AI Competitive Analysis — edit freely before using
                </p>
                <textarea
                  value={analysis.text}
                  onChange={(e) =>
                    setAnalyses((prev) => ({
                      ...prev,
                      [alert.candidate_id]: { ...prev[alert.candidate_id], text: e.target.value },
                    }))
                  }
                  className="w-full resize-none bg-transparent text-[13px] leading-relaxed"
                  style={{
                    border: "none",
                    outline: "none",
                    color: "var(--color-ink)",
                    fontFamily: "inherit",
                    minHeight: "240px",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
