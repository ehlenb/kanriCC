import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import { greetingByHour, todayFormatted, relativeTime } from "@/lib/candidate-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronRight, IconSparkles, IconCheck, IconBellOff, IconBriefcase, IconX } from "@tabler/icons-react";

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
  client_id?: string;
  candidate_id?: string;
  competing?: { company_name: string; stage: string | null }[];
  placement_milestone?: "day_1" | "two_week" | "one_month" | "three_month" | "long_term";
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

// ─── period helpers ───────────────────────────────────────────────────────────

// Period options are built inside the component using t() so they react to language changes

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

function businessDaysSince(iso: string): number {
  const start = new Date(iso);
  const now = new Date();
  let count = 0;
  const cursor = new Date(start);
  while (cursor < now) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── priority action helpers ──────────────────────────────────────────────────

function compUrgency(
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

// ─── priority actions hook (rule-based, no AI call) ───────────────────────────

function usePriorityActions(recruiterId: string) {
  const { t, i18n } = useTranslation();
  return useQuery({
    queryKey: ["priority-actions", recruiterId, i18n.language],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<AgendaItem[]> => {
      const now = new Date();
      const actions: AgendaItem[] = [];

      // Fetch all active processes with related data
      const { data: procs } = await supabase
        .from("processes")
        .select(
          "id, stage, candidate_id, cv_sent_at, last_activity_at, ccm_feedback_at, ccm_outcome, buy_in_confirmed_at, candidates(id, full_name), requisitions(id, title, clients(id, company_name))"
        )
        .eq("owner_recruiter_id", recruiterId)
        .not("stage", "in", '("Closed lost","Placed")');

      const activeCandidateIds = [
        ...new Set(
          (procs ?? [])
            .filter((p) => /^CCM\d+$/.test(p.stage) || p.stage === "Offer")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((p) => (p as any).candidate_id as string)
        ),
      ];

      // Fetch competing interviews for CCM/Offer candidates
      const compMap: Record<string, { company_name: string; stage: string | null }[]> = {};
      if (activeCandidateIds.length > 0) {
        const { data: competing } = await supabase
          .from("competing_interviews")
          .select("candidate_id, company_name, stage")
          .in("candidate_id", activeCandidateIds)
          .eq("is_active", true);
        for (const c of (competing ?? [])) {
          const cid = c.candidate_id as string;
          if (!compMap[cid]) compMap[cid] = [];
          compMap[cid].push({ company_name: c.company_name, stage: c.stage });
        }
      }

      for (const proc of (procs ?? [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cand = Array.isArray((proc as any).candidates) ? (proc as any).candidates[0] : (proc as any).candidates;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const req = Array.isArray((proc as any).requisitions) ? (proc as any).requisitions[0] : (proc as any).requisitions;
        const cli = req?.clients ? (Array.isArray(req.clients) ? req.clients[0] : req.clients) : null;

        const candidateId = (proc as { candidate_id?: string }).candidate_id ?? "";
        const candidateName = (cand as { full_name?: string } | null)?.full_name ?? "—";
        const firstName = candidateName.split(" ")[0];
        const clientName = (cli as { company_name?: string } | null)?.company_name ?? "—";
        const clientId = (cli as { id?: string } | null)?.id;

        const lastTouch = proc.last_activity_at ? new Date(proc.last_activity_at) : null;
        const daysSinceTouch = lastTouch
          ? Math.floor((now.getTime() - lastTouch.getTime()) / 86_400_000)
          : 999;

        // Rule 1: Offer stage — highest priority
        if (proc.stage === "Offer") {
          actions.push({
            entity_type: "candidate", entity_id: candidateId,
            entity_name: candidateName, process_id: proc.id, stage: proc.stage,
            candidate_id: candidateId, client_id: clientId,
            reason: t("dashboard.rules.offer.reason", { client: clientName, lastContact: daysSinceTouch < 999 ? t("dashboard.rules.offer.lastContactSuffix", { days: daysSinceTouch }) : "" }),
            suggested_action: t("dashboard.rules.offer.action", { name: firstName }),
            action_type: "pre_call", priority_rank: 1,
          });
        }

        const ccmMatch = /^CCM(\d+)$/.exec(proc.stage);

        // Rule 2: Competing interview risk (critical or high) for CCM/Offer stages
        const competing = compMap[candidateId];
        if (competing?.length) {
          const urgency = compUrgency(proc.stage, competing);
          if (urgency !== "medium") {
            const compList = competing.map((c) => c.company_name).join(", ");
            actions.push({
              entity_type: "candidate", entity_id: candidateId,
              entity_name: candidateName, process_id: proc.id, stage: proc.stage,
              candidate_id: candidateId, client_id: clientId,
              reason: t("dashboard.rules.competing.reason", { companies: compList, urgency: urgency === "critical" ? t("dashboard.rules.competing.critical") : t("dashboard.rules.competing.high") }),
              suggested_action: t("dashboard.rules.competing.action", { name: firstName, client: clientName }),
              action_type: "competing_risk",
              priority_rank: urgency === "critical" ? 2 : 7,
              competing,
            });
          }
        }

        // Rule 3: CCM stage — feedback from client not yet logged
        if (ccmMatch && !proc.ccm_feedback_at) {
          const ccmNum = parseInt(ccmMatch[1], 10);
          actions.push({
            entity_type: "candidate", entity_id: candidateId,
            entity_name: candidateName, process_id: proc.id, stage: proc.stage,
            candidate_id: candidateId, client_id: clientId,
            reason: t("dashboard.rules.ccmFeedback.reason", { num: ccmNum, client: clientName, days: daysSinceTouch }),
            suggested_action: t("dashboard.rules.ccmFeedback.action", { client: clientName, num: ccmNum, name: firstName }),
            action_type: "ccm_feedback", priority_rank: 10,
          });
        }

        // Rule 4: CV Sent > 3 business days with no response
        if (proc.stage === "CV Sent" && proc.cv_sent_at) {
          const bizDaysSinceCv = businessDaysSince(proc.cv_sent_at);
          if (bizDaysSinceCv >= 3) {
            actions.push({
              entity_type: "candidate", entity_id: candidateId,
              entity_name: candidateName, process_id: proc.id, stage: proc.stage,
              candidate_id: candidateId, client_id: clientId,
              reason: t("dashboard.rules.cvSent.reason", { client: clientName, days: bizDaysSinceCv }),
              suggested_action: t("dashboard.rules.cvSent.action", { client: clientName, name: firstName }),
              action_type: "follow_up", priority_rank: 20,
            });
          }
        }

        // Rule 5: Buy-In stalled > 7 days
        if (proc.stage === "Buy-In" && daysSinceTouch > 7) {
          actions.push({
            entity_type: "candidate", entity_id: candidateId,
            entity_name: candidateName, process_id: proc.id, stage: proc.stage,
            candidate_id: candidateId, client_id: clientId,
            reason: t("dashboard.rules.buyIn.reason", { days: daysSinceTouch }),
            suggested_action: t("dashboard.rules.buyIn.action", { name: firstName }),
            action_type: "pre_call", priority_rank: 30,
          });
        }

        // Rule 6: Active process gone cold (last touch > 30 days, non-terminal)
        if (
          !["Offer", "CV Sent", "Buy-In"].includes(proc.stage) &&
          !/^CCM\d+$/.test(proc.stage) &&
          daysSinceTouch > 30
        ) {
          actions.push({
            entity_type: "candidate", entity_id: candidateId,
            entity_name: candidateName, process_id: proc.id, stage: proc.stage,
            candidate_id: candidateId, client_id: clientId,
            reason: t("dashboard.rules.cold.reason", { days: daysSinceTouch, client: clientName }),
            suggested_action: t("dashboard.rules.cold.action", { name: firstName }),
            action_type: "pre_call", priority_rank: 40,
          });
        }
      }

      // Sort by priority rank ascending (lower = more urgent)
      actions.sort((a, b) => a.priority_rank - b.priority_rank);
      return actions;
    },
  });
}

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

// ─── dashboard component ──────────────────────────────────────────────────────

// ─── pipeline revenue hook ───────────────────────────────────────────────────

type PipelineRevenue = {
  totalPipeline: number;
  needsAction: number;
  likelyToPlace: number;
};

function usePipelineRevenue(recruiterId: string, flaggedIds: Set<string>) {
  return useQuery({
    queryKey: ["pipeline-revenue", recruiterId],
    queryFn: async (): Promise<PipelineRevenue> => {
      const { data: processes } = await supabase
        .from("processes")
        .select("id, stage, requisition_id, requisitions ( salary_min, salary_max, clients ( fee_pct ) )")
        .eq("owner_recruiter_id", recruiterId)
        .not("stage", "in", '("Placed","Closed lost")');

      let totalPipeline = 0;
      let needsAction = 0;
      let likelyToPlace = 0;

      for (const raw of processes ?? []) {
        const proc = raw as {
          id: string;
          stage: string;
          requisitions: {
            salary_min: number | null;
            salary_max: number | null;
            clients: { fee_pct: number | null } | null;
          } | null;
        };
        const salaryMid = ((proc.requisitions?.salary_min ?? 0) + (proc.requisitions?.salary_max ?? 0)) / 2;
        const feePct = (proc.requisitions?.clients?.fee_pct ?? 0) / 100;
        const fee = salaryMid * feePct;
        if (fee <= 0) continue;

        totalPipeline += fee;
        if (flaggedIds.has(proc.id)) needsAction += fee;
        if (proc.stage === "Offer") likelyToPlace += fee;
      }

      return { totalPipeline, needsAction, likelyToPlace };
    },
    staleTime: 30_000,
    retry: 1,
    enabled: !!recruiterId,
  });
}

function PipelineRevenueStrip({ revenue }: { revenue: PipelineRevenue | undefined }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const formatFee = (n: number) =>
    n >= 1_000_000 ? `¥${(n / 1_000_000).toFixed(1)}M` : n > 0 ? `¥${Math.round(n / 1000)}K` : "—";

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full text-left px-4 py-2 text-[11px] font-mono tracking-[0.08em] uppercase"
        style={{ border: "0.5px solid var(--color-ink-15)", color: "var(--color-ink-30)", outline: "none" }}
      >
        {t("dashboard.pipelineRevenueShow")}
      </button>
    );
  }

  const tiles = [
    { label: t("dashboard.activePipeline"), value: formatFee(revenue?.totalPipeline ?? 0), sublabel: t("dashboard.totalPotentialFees"), color: "var(--color-ink)" },
    { label: t("dashboard.needsAction"),    value: formatFee(revenue?.needsAction ?? 0),   sublabel: t("dashboard.flaggedInQueue"),      color: "var(--color-gold)" },
    { label: t("dashboard.likelyToPlace"), value: formatFee(revenue?.likelyToPlace ?? 0), sublabel: t("dashboard.atOfferStage"),         color: "var(--color-moss)" },
  ];

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}>
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>{t('dashboard.pipelineRevenue')}</span>
        <button onClick={() => setCollapsed(true)} className="font-mono text-[10px] tracking-[0.06em]" style={{ color: "var(--color-ink-30)", outline: "none" }}>{t("dashboard.hide")}</button>
      </div>
      <div className="grid grid-cols-3">
        {tiles.map((tile, i) => (
          <div
            key={tile.label}
            className="px-5 py-4"
            style={{ borderRight: i < 2 ? "0.5px solid var(--color-ink-15)" : "none" }}
          >
            <span className="text-2xl font-display font-semibold leading-none" style={{ color: tile.color }}>
              {revenue ? tile.value : "—"}
            </span>
            <p className="mt-1.5 text-[12px] font-medium">{tile.label}</p>
            <p className="mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: "var(--color-ink-30)" }}>{tile.sublabel}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const recruiterId = user!.id;
  const navigate = useNavigate();

  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [showAllAgenda, setShowAllAgenda] = useState(false);

  const metrics = useWeeklyMetrics(recruiterId);
  const priorityActions = usePriorityActions(recruiterId);

  useEffect(() => {
    if (priorityActions.data) {
      setAgendaItems(priorityActions.data.filter((item) => isVisible(item.entity_id)));
    }
  }, [priorityActions.data]);

  // Set of flagged process_ids for revenue strip "needs action" calculation
  const flaggedProcessIds = React.useMemo(
    () => new Set((priorityActions.data ?? []).map((i) => i.process_id).filter(Boolean) as string[]),
    [priorityActions.data],
  );
  const pipelineRevenue = usePipelineRevenue(recruiterId, flaggedProcessIds);

  function handleRestore() {
    localStorage.removeItem("kanri_done_today");
    localStorage.removeItem("kanri_snoozed");
    if (priorityActions.data) {
      setAgendaItems(priorityActions.data);
    }
  }

  function handleDone(entityId: string) {
    const removed = agendaItems.find((i) => i.entity_id === entityId);
    markDoneToday(entityId);
    setAgendaItems((prev) => prev.filter((i) => i.entity_id !== entityId));
    if (removed) {
      toast(t("dashboard.toast.markedDone"), {
        action: {
          label: t("dashboard.toast.undo"),
          onClick: () => {
            const d = getDoneToday();
            delete d[entityId];
            localStorage.setItem("kanri_done_today", JSON.stringify(d));
            setAgendaItems((prev) => {
              if (prev.some((i) => i.entity_id === entityId)) return prev;
              return [removed, ...prev];
            });
          },
        },
        duration: 6000,
      });
    }
  }
  function handleSnooze(entityId: string) {
    const removed = agendaItems.find((i) => i.entity_id === entityId);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    snoozeUntil(entityId, tomorrow.toISOString().slice(0, 10));
    setAgendaItems((prev) => prev.filter((i) => i.entity_id !== entityId));
    if (removed) {
      toast(t("dashboard.toast.snoozedTomorrow"), {
        action: {
          label: t("dashboard.toast.undo"),
          onClick: () => {
            const d = getSnoozed();
            delete d[entityId];
            localStorage.setItem("kanri_snoozed", JSON.stringify(d));
            setAgendaItems((prev) => {
              if (prev.some((i) => i.entity_id === entityId)) return prev;
              return [removed, ...prev];
            });
          },
        },
        duration: 6000,
      });
    }
  }
  const m = metrics.data;

  const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: "week",    label: t("dashboard.period.week") },
    { value: "30d",     label: t("dashboard.period.30d") },
    { value: "month",   label: t("dashboard.period.month") },
    { value: "quarter", label: t("dashboard.period.quarter") },
    { value: "all",     label: t("dashboard.period.all") },
  ];

  const METRIC_CONFIG: {
    key: MetricKey;
    label: string;
    value: number | string;
    sublabel: string;
  }[] = [
    { key: "specs",        label: t("dashboard.metrics.specsOut"),     value: m?.specs        ?? "—", sublabel: t("dashboard.metrics.thisWeek") },
    { key: "cvs",          label: t("dashboard.metrics.cvsSent"),      value: m?.cvs          ?? "—", sublabel: t("dashboard.metrics.thisWeek") },
    { key: "interviewing", label: t("dashboard.metrics.interviewing"), value: m?.interviewing ?? "—", sublabel: t("dashboard.metrics.activeNow") },
    { key: "offers",       label: t("dashboard.metrics.offers"),       value: m?.offers       ?? "—", sublabel: t("dashboard.metrics.activeNow") },
    {
      key: "placed",
      label: t("dashboard.metrics.placed"),
      value: m ? (m.placedFee > 0 ? formatFee(m.placedFee) : m.placedCount) : "—",
      sublabel: t("dashboard.metrics.thisWeek"),
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
          {todayFormatted()}&nbsp;&middot;&nbsp;{t("dashboard.weekResets")}
        </p>
      </div>

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

      {/* Pipeline revenue strip */}
      <PipelineRevenueStrip revenue={pipelineRevenue.data} />

      {/* Priority actions */}
      <PrioritySection
        items={agendaItems}
        isLoading={priorityActions.isLoading}
        showAll={showAllAgenda}
        onToggleShowAll={() => setShowAllAgenda((v) => !v)}
        onDone={handleDone}
        onSnooze={handleSnooze}
        onRestore={handleRestore}
        recruiterId={recruiterId}
        onNavigate={(item) => {
          if (item.entity_type === "candidate") {
            void navigate({ to: "/candidates/$id", params: { id: item.entity_id }, search: BLANK_CANDIDATE_SEARCH });
          } else if (item.entity_type === "requisition") {
            if (item.client_id) {
              void navigate({ to: "/clients/$id", params: { id: item.client_id } });
            } else {
              void navigate({ to: "/jobs" });
            }
          } else {
            void navigate({ to: "/clients/$id", params: { id: item.entity_id } });
          }
        }}
      />
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
  const { t } = useTranslation();
  const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: "week",    label: t("dashboard.period.week") },
    { value: "30d",     label: t("dashboard.period.30d") },
    { value: "month",   label: t("dashboard.period.month") },
    { value: "quarter", label: t("dashboard.period.quarter") },
    { value: "all",     label: t("dashboard.period.all") },
  ];
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
          {t("dashboard.period.filterBy")}
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
            <ProcessTable items={cvs.data ?? []} dateCol="cv_sent_at" dateLabel={t("dashboard.detail.cols.cvSent")} onNavigate={onNavigate} />
          )}
          {metric === "interviewing" && (
            <InterviewingTable items={interviewing.data ?? []} onNavigate={onNavigate} />
          )}
          {metric === "offers" && (
            <ProcessTable items={offers.data ?? []} dateCol="offer_date" dateLabel={t("dashboard.detail.cols.offerDate")} onNavigate={onNavigate} />
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
  const { t } = useTranslation();
  if (!items.length) return <EmptyRow message={t("dashboard.detail.noSpecs")} />;
  return (
    <div>
      <TableHeader cols={[t("dashboard.detail.cols.candidate"), t("dashboard.detail.cols.client"), t("dashboard.detail.cols.summary"), t("dashboard.detail.cols.date")]} />
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
  const { t } = useTranslation();
  if (!items.length) return <EmptyRow message={t("dashboard.detail.noEntries")} />;
  return (
    <div>
      <TableHeader cols={[t("dashboard.detail.cols.candidate"), t("dashboard.detail.cols.company"), t("dashboard.detail.cols.role"), dateLabel]} />
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
  const { t } = useTranslation();
  if (!items.length) return <EmptyRow message={t("dashboard.detail.noInterviews")} />;

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
              {stage} — {t("candidates.count", { count: stageItems.length })}
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
  const { t } = useTranslation();
  if (!items.length) return <EmptyRow message={t("dashboard.detail.noPlacements")} />;

  const totalFee = items.reduce((sum, i) => sum + (i.placed_fee_jpy ?? 0), 0);

  return (
    <div>
      <TableHeader cols={[t("dashboard.detail.cols.candidate"), t("dashboard.detail.cols.company"), t("dashboard.detail.cols.role"), t("dashboard.detail.cols.date"), t("dashboard.detail.cols.fee")]} />
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
  Offer:    "var(--color-gold)",
  "Buy-In": "var(--color-ink-30)",
};

function stageBadgeColor(stage: string | undefined): string {
  if (!stage) return "var(--color-ink-30)";
  if (/^CCM\d+$/.test(stage)) return "var(--color-indigo)";
  return STAGE_COLOR[stage] ?? "var(--color-ink-30)";
}

type BriefState = {
  loading: boolean;
  text: string | null;
  chainLoading?: boolean;
  chainText?: string | null;
  chainType?: "pass" | "reject" | "no_response";
};

// ─── markdown renderer (bold + bullets only, no library) ─────────────────────

function renderMd(text: string): React.ReactNode[] {
  return text.split("\n").map((line, li) => {
    const trimmed = line.trimStart();
    const isBullet = trimmed.startsWith("• ") || trimmed.startsWith("- ");
    const content = isBullet ? trimmed.slice(2) : line;

    const parts = content.split(/\*\*(.+?)\*\*/g).map((seg, si) =>
      si % 2 === 1
        ? <strong key={si} style={{ fontWeight: 600, color: "var(--color-ink)" }}>{seg}</strong>
        : seg,
    );

    if (isBullet) {
      return (
        <div key={li} className="flex gap-2 mt-1">
          <span style={{ color: "var(--color-ink-30)", flexShrink: 0, marginTop: 1 }}>•</span>
          <span>{parts}</span>
        </div>
      );
    }
    if (!line.trim()) return <div key={li} className="h-3" />;
    return <div key={li} className="mt-1">{parts}</div>;
  });
}

function BriefContent({
  text,
  label,
  onChange,
}: {
  text: string;
  label?: string;
  onChange: (t: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const { t } = useTranslation();

  return (
    <div className="px-5 py-4">
      {label && (
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase block mb-3" style={{ color: "var(--color-ink-30)" }}>
          {label}
        </span>
      )}
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          className="w-full resize-none bg-transparent text-[13px] leading-relaxed"
          style={{ border: "none", outline: "none", color: "var(--color-ink)", fontFamily: "inherit", minHeight: "180px" }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-[13px] leading-relaxed cursor-text"
          style={{ color: "var(--color-ink-60)" }}
          title="Click to edit"
        >
          {renderMd(text)}
        </div>
      )}
      {!editing && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setEditing(true)}
            className="font-mono text-[10px] underline"
            style={{ color: "var(--color-ink-30)", outline: "none" }}
          >
            {t("common.edit")}
          </button>
          <TranslateButtonInline text={text} onTranslated={onChange} />
        </div>
      )}
    </div>
  );
}

function TranslateButtonInline({ text, onTranslated }: { text: string; onTranslated: (t: string) => void }) {
  const { i18n } = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const targetLang = i18n.language === "ja" ? "ja" : "en";
  const label = i18n.language === "ja" ? "翻訳" : "Translate";
  const doneLabel = i18n.language === "ja" ? "翻訳済み" : "Translated";

  async function handle() {
    if (!text?.trim() || done) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_lang: targetLang }),
      });
      const data = await res.json() as { translated?: string };
      if (data.translated) { onTranslated(data.translated); setDone(true); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  return (
    <button
      onClick={() => void handle()}
      disabled={loading || done}
      className="font-mono text-[10px]"
      style={{ color: done ? "var(--color-moss)" : "var(--color-indigo)", opacity: loading ? 0.5 : 1, outline: "none" }}
    >
      {loading ? "…" : done ? doneLabel : label}
    </button>
  );
}

function PrioritySection({
  items,
  isLoading,
  showAll,
  onToggleShowAll,
  onDone,
  onSnooze,
  onNavigate,
  onRestore,
  recruiterId,
}: {
  items: AgendaItem[];
  isLoading: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onDone: (entityId: string) => void;
  onSnooze: (entityId: string) => void;
  onNavigate: (item: AgendaItem) => void;
  onRestore: () => void;
  recruiterId: string;
}) {
  const { t } = useTranslation();
  const VISIBLE_COUNT = 5;
  const visible = showAll ? items : items.slice(0, VISIBLE_COUNT);
  const [briefs, setBriefs] = useState<Record<string, BriefState>>({});
  const [checkinFormat, setCheckinFormat] = useState<"email" | "linkedin" | "short">("email");

  async function getChainStep(briefKey: string, processId: string, scenario: "pass" | "reject" | "no_response") {
    setBriefs((prev) => ({ ...prev, [briefKey]: { ...prev[briefKey], chainLoading: true, chainText: null, chainType: scenario } }));
    try {
      const resp = await fetch("/api/ai/ccm-next-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_id: processId, scenario }),
      });
      const json = (await resp.json()) as { content?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setBriefs((prev) => ({ ...prev, [briefKey]: { ...prev[briefKey], chainLoading: false, chainText: json.content ?? "" } }));
    } catch {
      toast.error("Could not generate next step. Try again.");
      setBriefs((prev) => ({ ...prev, [briefKey]: { ...prev[briefKey], chainLoading: false } }));
    }
  }

  async function getAiBrief(item: AgendaItem, format?: "email" | "linkedin" | "short") {
    const key = `${item.action_type}-${item.process_id ?? item.entity_id}`;
    // Close all other open briefs — only one at a time
    setBriefs({ [key]: { loading: true, text: null } });
    try {
      let resp: Response;
      if (item.placement_milestone && item.process_id) {
        const fmt = format ?? checkinFormat;
        resp = await fetch("/api/ai/placed-checkin-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            process_id: item.process_id,
            milestone: item.placement_milestone,
            format: fmt,
          }),
        });
      } else if (item.action_type === "competing_risk") {
        resp = await fetch("/api/ai/competing-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_id: item.candidate_id,
            process_id: item.process_id ?? null,
            competing: item.competing ?? [],
          }),
        });
      } else if (item.action_type === "ccm_feedback") {
        resp = await fetch("/api/ai/ccm-feedback-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ process_id: item.process_id }),
        });
      } else {
        resp = await fetch("/api/ai/pre-call-briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            process_id: item.process_id ?? null,
            recruiter_id: recruiterId,
          }),
        });
      }
      const json = (await resp.json()) as { content?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setBriefs((prev) => ({ ...prev, [key]: { loading: false, text: json.content ?? "" } }));
    } catch {
      toast.error("Could not generate brief. Try again.");
      setBriefs((prev) => ({ ...prev, [key]: { loading: false, text: null } }));
    }
  }

  // Derive the active brief and which item it belongs to
  const activeBriefKey = Object.keys(briefs).find((k) => briefs[k].loading || briefs[k].text !== null);
  const activeBrief = activeBriefKey ? briefs[activeBriefKey] : null;
  const activeBriefItem = activeBriefKey
    ? visible.find((item) => `${item.action_type}-${item.process_id ?? item.entity_id}` === activeBriefKey)
    : null;

  return (
    <div className="flex" style={{ border: "0.5px solid var(--color-ink-15)" }}>
      {/* ── Left: priority list ───────────────────────────────────────────── */}
      <div className="flex flex-col min-w-0" style={{ flex: activeBrief ? "0 0 42%" : "1 1 100%", borderRight: activeBrief ? "0.5px solid var(--color-ink-15)" : "none", transition: "flex-basis 0.2s ease" }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>
              {t('dashboard.priorityActions')}
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
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
                {t('dashboard.noPriorityActions')}
              </span>
              {Object.keys(getDoneToday()).length > 0 && (
                <button onClick={onRestore} className="text-[11px] underline" style={{ color: "var(--color-ink-60)" }}>
                  {t('dashboard.restoreDismissed', { count: Object.keys(getDoneToday()).length })}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="px-4 py-4 space-y-3">
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
          const briefKey = `${item.action_type}-${item.process_id ?? item.entity_id}`;
          const isActive = briefKey === activeBriefKey;

          return (
            <div
              key={`${item.entity_id}-${item.process_id ?? ""}-${i}`}
              style={{
                borderBottom: i < visible.length - 1 ? "2px solid var(--color-ink-10)" : "none",
                background: isActive ? "var(--color-indigo-light)" : "transparent",
              }}
            >
              <div className="flex items-stretch">
                {/* Priority number */}
                <div
                  className="flex w-9 shrink-0 flex-col items-center justify-start pt-3 gap-1"
                  style={{ background: isActive ? "transparent" : "var(--color-ink-10)", borderRight: "0.5px solid var(--color-ink-15)" }}
                >
                  <span className="font-mono text-[11px] font-medium" style={{ color: accentColor }}>{i + 1}</span>
                </div>

                {/* Content */}
                <button
                  onClick={() => onNavigate(item)}
                  className="flex flex-1 flex-col items-start px-3 py-3 text-left transition-colors hover:bg-[--color-ink-10] min-w-0"
                  style={{ outline: "none" }}
                >
                  <div className="flex w-full items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isReq && <IconBriefcase size={12} style={{ color: "var(--color-gold)", flexShrink: 0 }} />}
                      <span className="text-[13px] font-medium font-display truncate">{item.entity_name}</span>
                      {item.stage && (
                        <span
                          className="shrink-0 font-mono text-[9px] tracking-[0.08em] uppercase px-1 py-0.5"
                          style={{ background: stageBadgeColor(item.stage) + "22", color: stageBadgeColor(item.stage) }}
                        >
                          {item.stage}
                        </span>
                      )}
                    </div>
                    <IconChevronRight size={12} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
                  </div>
                  <p className="text-[11px] leading-snug" style={{ color: "var(--color-ink-60)" }}>{item.reason}</p>
                  {item.suggested_action && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-60)" }}>→ {item.suggested_action}</p>
                  )}
                </button>

                {/* Action strip */}
                <div className="flex shrink-0 flex-col border-l" style={{ borderColor: "var(--color-ink-15)" }}>
                  {/* Sparkle */}
                  <div className="group/tip relative flex flex-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); isActive ? setBriefs({}) : void getAiBrief(item); }}
                      disabled={activeBrief?.loading && !isActive}
                      className="flex flex-1 items-center justify-center w-9 transition-colors hover:bg-[--color-indigo-light]"
                      style={{ outline: "none", borderBottom: "0.5px solid var(--color-ink-15)", opacity: activeBrief?.loading && !isActive ? 0.4 : 1 }}
                    >
                      <IconSparkles size={12} style={{ color: isActive ? "var(--color-indigo)" : "var(--color-ink-30)" }} />
                    </button>
                    <div className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:flex items-center z-50">
                      <span className="whitespace-nowrap font-mono text-[10px] px-2 py-1" style={{ background: "var(--color-ink)", color: "var(--color-white)", letterSpacing: "0.05em" }}>AI insights</span>
                      <span style={{ borderLeft: "4px solid var(--color-ink)", borderTop: "4px solid transparent", borderBottom: "4px solid transparent" }} />
                    </div>
                  </div>
                  {/* Done */}
                  <div className="group/tip relative flex flex-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDone(item.entity_id); }}
                      className="flex flex-1 items-center justify-center w-9 transition-colors hover:bg-[--color-moss-light]"
                      style={{ outline: "none", borderBottom: "0.5px solid var(--color-ink-15)" }}
                    >
                      <IconCheck size={12} style={{ color: "var(--color-ink-30)" }} />
                    </button>
                    <div className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:flex items-center z-50">
                      <span className="whitespace-nowrap font-mono text-[10px] px-2 py-1" style={{ background: "var(--color-ink)", color: "var(--color-white)", letterSpacing: "0.05em" }}>Done for today</span>
                      <span style={{ borderLeft: "4px solid var(--color-ink)", borderTop: "4px solid transparent", borderBottom: "4px solid transparent" }} />
                    </div>
                  </div>
                  {/* Snooze */}
                  <div className="group/tip relative flex flex-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSnooze(item.entity_id); }}
                      className="flex flex-1 items-center justify-center w-9 transition-colors hover:bg-[--color-gold-light]"
                      style={{ outline: "none" }}
                    >
                      <IconBellOff size={12} style={{ color: "var(--color-ink-30)" }} />
                    </button>
                    <div className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover/tip:flex items-center z-50">
                      <span className="whitespace-nowrap font-mono text-[10px] px-2 py-1" style={{ background: "var(--color-ink)", color: "var(--color-white)", letterSpacing: "0.05em" }}>{t("dashboard.brief.snoozeTooltip")}</span>
                      <span style={{ borderLeft: "4px solid var(--color-ink)", borderTop: "4px solid transparent", borderBottom: "4px solid transparent" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Show more / less */}
        {!isLoading && items.length > VISIBLE_COUNT && (
          <button
            onClick={onToggleShowAll}
            className="w-full py-2 text-center text-[11px] font-medium transition-colors hover:bg-[--color-ink-10]"
            style={{ color: "var(--color-ink-60)", borderTop: "0.5px solid var(--color-ink-15)", outline: "none" }}
          >
            {showAll ? t("dashboard.detail.showLess") : t("dashboard.detail.showMore", { count: items.length - VISIBLE_COUNT })}
          </button>
        )}
      </div>

      {/* ── Right: brief panel ────────────────────────────────────────────── */}
      {activeBrief && (
        <div className="flex flex-col min-w-0" style={{ flex: "1 1 58%" }}>
          {/* Panel header */}
          <div
            className="shrink-0"
            style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
          >
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <IconSparkles size={12} style={{ color: "var(--color-indigo)", flexShrink: 0 }} />
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase truncate" style={{ color: "var(--color-indigo)" }}>
                  {activeBriefItem?.placement_milestone
                    ? `${t("dashboard.brief.checkinMsg")} · ${activeBriefItem.entity_name}`
                    : activeBriefItem?.action_type === "ccm_feedback"
                    ? `${t("dashboard.brief.clientChase")} · ${activeBriefItem.entity_name}`
                    : activeBriefItem?.action_type === "competing_risk"
                    ? `${t("dashboard.brief.competingRisk")} · ${activeBriefItem.entity_name}`
                    : `${t("dashboard.brief.aiInsights")} · ${activeBriefItem?.entity_name ?? ""}`}
                </span>
              </div>
              <button onClick={() => setBriefs({})} style={{ color: "var(--color-ink-30)", outline: "none", flexShrink: 0 }}>
                <IconX size={13} />
              </button>
            </div>
            {/* Format selector for placement check-in messages */}
            {activeBriefItem?.placement_milestone && (
              <div className="flex px-5 pb-3 gap-1.5">
                {(["email", "linkedin", "short"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      setCheckinFormat(fmt);
                      void getAiBrief(activeBriefItem, fmt);
                    }}
                    className="font-mono text-[9px] tracking-[0.08em] uppercase px-2.5 py-1"
                    style={{
                      background: checkinFormat === fmt ? "var(--color-indigo)" : "transparent",
                      color: checkinFormat === fmt ? "var(--color-white)" : "var(--color-ink-60)",
                      border: checkinFormat === fmt ? "none" : "0.5px solid var(--color-ink-15)",
                      outline: "none",
                    }}
                  >
                    {fmt === "email" ? t("dashboard.brief.formatEmail") : fmt === "linkedin" ? t("dashboard.brief.formatLinkedin") : t("dashboard.brief.formatShortMsg")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Loading state */}
          {activeBrief.loading && (
            <div className="flex-1 flex items-center justify-center px-6 py-10">
              <div className="space-y-3 w-full max-w-sm">
                {[100, 85, 90, 70].map((w, i) => (
                  <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          )}

          {/* Brief content */}
          {!activeBrief.loading && activeBrief.text && (
            <div className="flex-1 flex flex-col overflow-y-auto">
              <BriefContent
                text={activeBrief.text}
                onChange={(t) => setBriefs((prev) => ({ ...prev, [activeBriefKey!]: { ...prev[activeBriefKey!], text: t } }))}
              />

              {/* CCM chain */}
              {activeBriefItem?.action_type === "ccm_feedback" && activeBriefItem.process_id && (
                <div style={{ borderTop: "1px solid var(--color-ink-15)" }}>
                  <div className="px-5 pt-3 pb-2 flex items-center gap-2">
                    <span className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>
                      {t("dashboard.brief.whatNext")}
                    </span>
                  </div>
                  <div className="flex" style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
                    {(
                      [
                        { scenario: "pass" as const, label: t("dashboard.brief.outcomePass"), color: "var(--color-moss)", bg: "var(--color-moss-light)" },
                        { scenario: "reject" as const, label: t("dashboard.brief.outcomeReject"), color: "var(--color-vermillion)", bg: "var(--color-vermillion-light)" },
                        { scenario: "no_response" as const, label: t("dashboard.brief.outcomeNoResponse"), color: "var(--color-gold)", bg: "var(--color-gold-light)" },
                      ] as const
                    ).map(({ scenario, label, color, bg }) => (
                      <button
                        key={scenario}
                        onClick={() => void getChainStep(activeBriefKey!, activeBriefItem.process_id!, scenario)}
                        disabled={activeBrief.chainLoading}
                        className="flex flex-1 items-center justify-center py-2.5 text-[11px] font-medium transition-colors"
                        style={{
                          color: activeBrief.chainType === scenario ? color : "var(--color-ink-60)",
                          background: activeBrief.chainType === scenario ? bg : "transparent",
                          borderRight: scenario !== "no_response" ? "0.5px solid var(--color-ink-15)" : "none",
                          outline: "none",
                          opacity: activeBrief.chainLoading && activeBrief.chainType !== scenario ? 0.4 : 1,
                        }}
                      >
                        {activeBrief.chainLoading && activeBrief.chainType === scenario ? t("dashboard.brief.generating") : label}
                      </button>
                    ))}
                  </div>

                  {activeBrief.chainText && (
                    <div style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
                      <BriefContent
                        text={activeBrief.chainText}
                        label={t("dashboard.brief.nextStep")}
                        onChange={(t) => setBriefs((prev) => ({ ...prev, [activeBriefKey!]: { ...prev[activeBriefKey!], chainText: t } }))}
                      />
                    </div>
                  )}
                  {activeBrief.chainLoading && !activeBrief.chainText && (
                    <div className="px-5 py-6 space-y-2">
                      {[100, 80, 90].map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
