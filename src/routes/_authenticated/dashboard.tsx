import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import {
  greetingByHour,
  todayFormatted,
  relativeTime,
  initials,
} from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconSparkles,
  IconMail,
  IconUser,
  IconBuilding,
  IconArrowRight,
  IconGripVertical,
  IconBellOff,
  IconCheck,
  IconLock,
  IconWorld,
} from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// ─── localStorage helpers ─────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function getDoneToday(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("kanri_done_today") ?? "{}") as Record<string, string>; }
  catch { return {}; }
}

function getSnoozed(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("kanri_snoozed") ?? "{}") as Record<string, string>; }
  catch { return {}; }
}

function markDoneToday(entityId: string) {
  const data = getDoneToday();
  data[entityId] = TODAY;
  localStorage.setItem("kanri_done_today", JSON.stringify(data));
}

function snoozeUntil(entityId: string, date: string) {
  const data = getSnoozed();
  data[entityId] = date;
  localStorage.setItem("kanri_snoozed", JSON.stringify(data));
}

function isVisible(entityId: string): boolean {
  const done = getDoneToday();
  if (done[entityId] === TODAY) return false;
  const snoozed = getSnoozed();
  const snoozeDate = snoozed[entityId];
  if (snoozeDate && snoozeDate > TODAY) return false;
  return true;
}

// ─── types ───────────────────────────────────────────────────────────────────

type AgendaItem = {
  entity_type: "candidate" | "client";
  entity_id: string;
  entity_name: string;
  process_id?: string;
  stage?: string;
  reason: string;
  suggested_action: string;
  action_type: "open_briefing" | "draft_email" | "open_process" | "open_client";
  priority_rank: number;
};

type PipelineKpiType = "specs" | "cvs" | "interviewing" | "offers" | "placements";

type ProcessDetail = {
  id: string;
  stage: string;
  cv_sent_at: string | null;
  offer_date: string | null;
  placed_date: string | null;
  created_at: string;
  candidate_id: string;
  candidate_name: string;
  requisition_title: string;
  company_name: string;
  primary_contact: string | null;
};

type RecentInteraction = {
  id: string;
  interaction_type: string;
  summary: string | null;
  interacted_at: string;
  candidate_name: string | null;
  client_name: string | null;
};

// ─── date helpers ────────────────────────────────────────────────────────────

function getWeekStart(): string {
  const d = new Date();
  const daysSinceSat = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - daysSinceSat);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getQuarterStart(): string {
  const d = new Date();
  const quarterStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), quarterStartMonth, 1).toISOString();
}

// ─── data hooks ──────────────────────────────────────────────────────────────

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

function useActiveCandidateCount(recruiterId: string) {
  return useQuery({
    queryKey: ["active-candidate-count", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<number> => {
      const { count } = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("recruiter_id", recruiterId)
        .eq("candidate_status", "active");
      return count ?? 0;
    },
  });
}

function usePipelineData(recruiterId: string) {
  return useQuery({
    queryKey: ["pipeline-detail", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ProcessDetail[]> => {
      const { data } = await supabase
        .from("processes")
        .select(
          "id, stage, cv_sent_at, offer_date, placed_date, created_at, candidate_id, candidates ( id, full_name ), requisitions ( title, clients ( company_name, client_contacts ( name, is_primary ) ) )",
        )
        .eq("owner_recruiter_id", recruiterId);

      return (data ?? []).map((row) => {
        const cand = (Array.isArray(row.candidates) ? row.candidates[0] : row.candidates) as
          | { id: string; full_name: string }
          | null;
        const req = (Array.isArray(row.requisitions) ? row.requisitions[0] : row.requisitions) as
          | { title: string; clients: { company_name: string; client_contacts: { name: string; is_primary: boolean }[] | null } | null }
          | null;
        const client = req?.clients ?? null;
        const contacts: { name: string; is_primary: boolean }[] = Array.isArray(client?.client_contacts)
          ? (client!.client_contacts as { name: string; is_primary: boolean }[])
          : client?.client_contacts
          ? [client.client_contacts as unknown as { name: string; is_primary: boolean }]
          : [];
        const primaryContact = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;

        return {
          id: row.id,
          stage: row.stage,
          cv_sent_at: row.cv_sent_at ?? null,
          offer_date: row.offer_date ?? null,
          placed_date: row.placed_date ?? null,
          created_at: row.created_at,
          candidate_id: cand?.id ?? "",
          candidate_name: cand?.full_name ?? "—",
          requisition_title: req?.title ?? "—",
          company_name: client?.company_name ?? "—",
          primary_contact: primaryContact?.name ?? null,
        };
      });
    },
  });
}

function useRecentActivity(recruiterId: string) {
  return useQuery({
    queryKey: ["recent-activity", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<RecentInteraction[]> => {
      const { data } = await supabase
        .from("interactions")
        .select(
          "id, interaction_type, summary, interacted_at, candidates ( full_name ), clients ( company_name )",
        )
        .eq("recruiter_id", recruiterId)
        .order("interacted_at", { ascending: false })
        .limit(10);

      return (data ?? []).map((row) => {
        const cand = Array.isArray(row.candidates) ? row.candidates[0] : row.candidates;
        const cl = Array.isArray(row.clients) ? row.clients[0] : row.clients;
        return {
          id: row.id,
          interaction_type: row.interaction_type,
          summary: row.summary,
          interacted_at: row.interacted_at,
          candidate_name: (cand as { full_name?: string } | null)?.full_name ?? null,
          client_name: (cl as { company_name?: string } | null)?.company_name ?? null,
        };
      });
    },
  });
}

// ─── pipeline KPI config ──────────────────────────────────────────────────────

const KPI_CONFIG: {
  key: PipelineKpiType;
  label: string;
  period: "week" | "quarter";
  tone?: "info" | "gold" | "success";
}[] = [
  { key: "specs",        label: "Job Specs Sent",  period: "week" },
  { key: "cvs",         label: "CVs Sent",         period: "week" },
  { key: "interviewing", label: "Interviewing",    period: "week",    tone: "info" },
  { key: "offers",       label: "Offers",          period: "week",    tone: "gold" },
  { key: "placements",   label: "Placements",      period: "quarter", tone: "success" },
];

type StageKey = "sourced" | "screen" | "client" | "offer" | "placed";

const STAGE_CONFIG: { key: StageKey; label: string }[] = [
  { key: "sourced", label: "Sourced" },
  { key: "screen",  label: "Screen" },
  { key: "client",  label: "Client" },
  { key: "offer",   label: "Offer" },
  { key: "placed",  label: "Placed" },
];

function bucketStage(stage: string): StageKey {
  if (stage === "Placed") return "placed";
  if (stage === "Offer") return "offer";
  if (/^CCM\d+$/.test(stage) || stage === "Buy-In") return "client";
  if (stage === "Screen" || stage === "Screening") return "screen";
  return "sourced";
}

function countByStage(processes: ProcessDetail[]): Record<StageKey, ProcessDetail[]> {
  const result: Record<StageKey, ProcessDetail[]> = {
    sourced: [], screen: [], client: [], offer: [], placed: [],
  };
  for (const p of processes) result[bucketStage(p.stage)].push(p);
  return result;
}

function filterByKpi(processes: ProcessDetail[], key: PipelineKpiType): ProcessDetail[] {
  const weekStart = getWeekStart();
  const quarterStart = getQuarterStart();
  switch (key) {
    case "specs":
      return processes.filter((p) => p.created_at >= weekStart);
    case "cvs":
      return processes.filter((p) => p.cv_sent_at && p.cv_sent_at >= weekStart);
    case "interviewing":
      return processes.filter((p) => /^CCM\d+$/.test(p.stage));
    case "offers":
      return processes.filter((p) => p.offer_date && p.offer_date >= weekStart);
    case "placements":
      return processes.filter((p) => p.placed_date && p.placed_date >= quarterStart);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const recruiterId = user!.id;
  const navigate = useNavigate();

  const agenda = useDailyAgenda(recruiterId);
  const pipelineQ = usePipelineData(recruiterId);
  const activity = useRecentActivity(recruiterId);
  const activeCandidateCount = useActiveCandidateCount(recruiterId);

  const [localItems, setLocalItems] = useState<AgendaItem[]>([]);
  const [activeStage, setActiveStage] = useState<StageKey | null>(null);

  useEffect(() => {
    if (agenda.data) {
      setLocalItems(agenda.data.filter((item) => isVisible(item.entity_id)));
    }
  }, [agenda.data]);

  function handleDone(entityId: string) {
    markDoneToday(entityId);
    setLocalItems((prev) => prev.filter((i) => i.entity_id !== entityId));
  }

  function handleSnooze(entityId: string, date: string) {
    snoozeUntil(entityId, date);
    setLocalItems((prev) => prev.filter((i) => i.entity_id !== entityId));
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    setLocalItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  const allProcesses = pipelineQ.data ?? [];
  const stageBuckets = countByStage(allProcesses);

  const interviewCount = filterByKpi(allProcesses, "interviewing").length;
  const offerCount     = filterByKpi(allProcesses, "offers").length;
  const placedCount    = filterByKpi(allProcesses, "placements").length;

  return (
    <div className="px-8 py-7 max-w-6xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-medium mb-0.5 font-display">{greetingByHour()}</h1>
        <p className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
          {todayFormatted()}&nbsp;&middot;&nbsp;Here is what needs your attention today
        </p>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-4" style={{ border: "0.5px solid var(--color-ink-15)" }}>
        {[
          { value: activeCandidateCount.data ?? "—", label: "Active", color: "var(--color-ink)" },
          { value: interviewCount,                    label: "Interviews", color: "var(--color-indigo)" },
          { value: offerCount,                        label: "Offers", color: "var(--color-gold)" },
          { value: placedCount,                       label: "Placed QTR", color: "var(--color-moss)" },
        ].map((stat, i) => (
          <div
            key={i}
            className="flex flex-col px-5 py-4"
            style={{ borderRight: i < 3 ? "0.5px solid var(--color-ink-15)" : "none" }}
          >
            <span className="text-3xl font-display font-semibold leading-none" style={{ color: stat.color }}>
              {pipelineQ.isLoading && i > 0 ? "—" : stat.value}
            </span>
            <span className="mt-1.5 font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: "var(--color-ink-30)" }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Pipeline stages bar */}
      <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
        <div className="flex">
          {STAGE_CONFIG.map((cfg, i) => {
            const isActive = activeStage === cfg.key;
            const count = stageBuckets[cfg.key].length;
            return (
              <button
                key={cfg.key}
                onClick={() => setActiveStage(isActive ? null : cfg.key)}
                className="flex flex-1 flex-col items-center py-4 transition-colors"
                style={{
                  background: isActive ? "var(--color-ink)" : "var(--color-white)",
                  borderRight: i < 4 ? "0.5px solid var(--color-ink-15)" : "none",
                  outline: "none",
                }}
              >
                <span
                  className="font-mono text-[10px] tracking-[0.1em] uppercase mb-2"
                  style={{ color: isActive ? "rgba(255,255,255,0.5)" : "var(--color-ink-30)" }}
                >
                  {cfg.label}
                </span>
                <span
                  className="text-2xl font-display font-semibold leading-none"
                  style={{ color: isActive ? "var(--color-white)" : "var(--color-ink)" }}
                >
                  {pipelineQ.isLoading ? "—" : count}
                </span>
              </button>
            );
          })}
        </div>

        {activeStage && !pipelineQ.isLoading && stageBuckets[activeStage].length > 0 && (
          <div style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
            <PipelineDetailPanel
              kpiKey={activeStage === "client" ? "interviewing" : activeStage === "offer" ? "offers" : activeStage === "placed" ? "placements" : "cvs"}
              items={stageBuckets[activeStage]}
              onNavigate={(candidateId) =>
                void navigate({ to: "/candidates/$id", params: { id: candidateId }, search: BLANK_CANDIDATE_SEARCH })
              }
            />
          </div>
        )}
        {activeStage && !pipelineQ.isLoading && stageBuckets[activeStage].length === 0 && (
          <div className="px-5 py-4" style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No processes at this stage.</p>
          </div>
        )}
      </div>

      {/* Daily agenda */}
      <div className="bg-card  p-5" style={{ border: "0.5px solid var(--color-ink-15)" }}>
        <p className="sl mb-3">Priority actions — ranked by urgency</p>

        {agenda.isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        )}

        {agenda.isError && (
          <p className="text-[13px]" style={{ color: "var(--color-danger)" }}>
            Could not load agenda. Try refreshing the page.
          </p>
        )}

        {!agenda.isLoading && !agenda.isError && localItems.length === 0 && (
          <EmptyAgenda />
        )}

        {localItems.map((item, i) => (
          <AgendaRow
            key={item.entity_id}
            item={item}
            index={i}
            onDone={handleDone}
            onSnooze={handleSnooze}
            onReorder={handleReorder}
          />
        ))}
      </div>

      {/* Two-column lower row: Recent activity + Saved lists */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent activity */}
        <div className="bg-card  p-5" style={{ border: "0.5px solid var(--color-ink-15)" }}>
          <p className="sl mb-3">Your recent activity</p>

          {activity.isLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}

          {!activity.isLoading && (activity.data?.length ?? 0) === 0 && (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No recent interactions logged.</p>
          )}

          {activity.data?.map((a) => (
            <ActivityRow key={a.id} item={a} />
          ))}
        </div>

        {/* Saved lists widget */}
        <SavedListsWidget recruiterId={user?.id ?? ""} />
      </div>
    </div>
  );
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────

// ─── pipeline detail panel ────────────────────────────────────────────────────

const DETAIL_COLUMNS: Record<PipelineKpiType, { header: string; render: (p: ProcessDetail) => string | null }[]> = {
  specs: [
    { header: "Candidate",   render: (p) => p.candidate_name },
    { header: "Company",     render: (p) => p.company_name },
    { header: "Job Title",   render: (p) => p.requisition_title },
    { header: "Contact",     render: (p) => p.primary_contact },
    { header: "Created",     render: (p) => new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) },
  ],
  cvs: [
    { header: "Candidate",   render: (p) => p.candidate_name },
    { header: "Company",     render: (p) => p.company_name },
    { header: "Job Title",   render: (p) => p.requisition_title },
    { header: "Contact",     render: (p) => p.primary_contact },
    { header: "CV Sent",     render: (p) => p.cv_sent_at ? new Date(p.cv_sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null },
  ],
  interviewing: [
    { header: "Candidate",   render: (p) => p.candidate_name },
    { header: "Company",     render: (p) => p.company_name },
    { header: "Job Title",   render: (p) => p.requisition_title },
    { header: "Contact",     render: (p) => p.primary_contact },
    { header: "Stage",       render: (p) => p.stage },
  ],
  offers: [
    { header: "Candidate",   render: (p) => p.candidate_name },
    { header: "Company",     render: (p) => p.company_name },
    { header: "Job Title",   render: (p) => p.requisition_title },
    { header: "Contact",     render: (p) => p.primary_contact },
    { header: "Offer Date",  render: (p) => p.offer_date ? new Date(p.offer_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null },
  ],
  placements: [
    { header: "Candidate",   render: (p) => p.candidate_name },
    { header: "Company",     render: (p) => p.company_name },
    { header: "Job Title",   render: (p) => p.requisition_title },
    { header: "Contact",     render: (p) => p.primary_contact },
    { header: "Placed",      render: (p) => p.placed_date ? new Date(p.placed_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null },
  ],
};

function PipelineDetailPanel({
  kpiKey,
  items,
  onNavigate,
}: {
  kpiKey: PipelineKpiType;
  items: ProcessDetail[];
  onNavigate: (candidateId: string) => void;
}) {
  const cfg = KPI_CONFIG.find((c) => c.key === kpiKey)!;
  const cols = DETAIL_COLUMNS[kpiKey];

  return (
    <div
      className="mt-4  overflow-hidden"
      style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-white)" }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "0.5px solid var(--color-border-subtle)", background: "var(--color-ink-10)" }}
      >
        <span className="text-[12px] font-medium" style={{ color: "var(--color-ink)" }}>
          {cfg.label}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
          {cfg.period === "week" ? "resets each Saturday" : "resets each quarter"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-center" style={{ color: "var(--color-ink-30)" }}>
          Nothing to show for this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}>
                {cols.map((col) => (
                  <th
                    key={col.header}
                    className="px-4 py-2 text-left font-medium"
                    style={{ color: "var(--color-ink-30)", whiteSpace: "nowrap" }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer"
                  style={{ borderBottom: "0.5px solid rgba(26,26,24,0.06)" }}
                  onClick={() => onNavigate(p.candidate_id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-ink-10)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  {cols.map((col, ci) => {
                    const val = col.render(p);
                    return (
                      <td
                        key={ci}
                        className="px-4 py-2.5"
                        style={{
                          color: ci === 0 ? "var(--color-ink)" : "var(--color-ink-60)",
                          fontWeight: ci === 0 ? 500 : 400,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ci === 4 && kpiKey === "interviewing" && val ? (
                          <StageBadge stage={val} />
                        ) : (
                          val ?? <span style={{ color: "#c8c7c2" }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── agenda row ───────────────────────────────────────────────────────────────

function AgendaRow({
  item,
  index,
  onDone,
  onSnooze,
  onReorder,
}: {
  item: AgendaItem;
  index: number;
  onDone: (entityId: string) => void;
  onSnooze: (entityId: string, date: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const navigate = useNavigate();
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState("");
  const snoozeRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Close snooze picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setShowSnooze(false);
      }
    }
    if (showSnooze) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSnooze]);

  const avatarBg =
    item.stage === "Offer" ? { bg: "var(--color-danger-bg)", color: "var(--color-danger)" }
    : item.stage === "Buy-In" ? { bg: "var(--color-gold-light)", color: "var(--color-gold)" }
    : /^CCM\d+$/.test(item.stage ?? "") ? { bg: "var(--color-indigo-light)", color: "var(--color-indigo)" }
    : { bg: "var(--color-ink-10)", color: "var(--color-ink-60)" };

  function handleAction() {
    if (item.entity_type === "client") {
      void navigate({ to: "/clients/$id", params: { id: item.entity_id } });
    } else {
      void navigate({ to: "/candidates/$id", params: { id: item.entity_id }, search: BLANK_CANDIDATE_SEARCH });
    }
  }

  const actionIcon =
    item.action_type === "open_briefing" ? <IconSparkles size={12} />
    : item.action_type === "draft_email" ? <IconMail size={12} />
    : item.action_type === "open_client" ? <IconBuilding size={12} />
    : <IconUser size={12} />;

  const actionLabel =
    item.action_type === "open_briefing" ? "Get briefing"
    : item.action_type === "draft_email" ? "Draft email"
    : item.action_type === "open_client" ? "Open client"
    : "Open profile";

  // Minimum snooze date is tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minSnooze = tomorrow.toISOString().slice(0, 10);

  return (
    <div
      draggable
      onDragStart={() => { dragIndex.current = index; }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => {
        setIsDragOver(false);
        if (dragIndex.current !== null && dragIndex.current !== index) {
          onReorder(dragIndex.current, index);
          dragIndex.current = null;
        }
      }}
      onDragEnd={() => { dragIndex.current = null; setIsDragOver(false); }}
      className="grid py-3"
      style={{
        gridTemplateColumns: "20px 36px 1fr auto",
        gap: 10,
        alignItems: "flex-start",
        borderBottom: "0.5px solid var(--color-ink-15)",
        opacity: isDragOver ? 0.5 : 1,
        cursor: "grab",
      }}
    >
      {/* Drag handle */}
      <div className="pt-2.5" style={{ color: "#c8c7c2", cursor: "grab" }}>
        <IconGripVertical size={13} />
      </div>

      {/* Avatar */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
        style={{ background: avatarBg.bg, color: avatarBg.color }}
      >
        {initials(item.entity_name)}
      </div>

      {/* Content */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[13px] font-medium">{item.entity_name}</span>
          {item.stage && <StageBadge stage={item.stage} />}
        </div>

        <p className="text-[12px] mb-1.5 leading-snug" style={{ color: "var(--color-gold)" }}>
          {item.reason}
        </p>

        <p className="text-[12px] mb-2 leading-snug" style={{ color: "var(--color-ink-60)" }}>
          {item.suggested_action}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button className="ab" onClick={handleAction}>
            {actionIcon}
            {actionLabel}
          </button>

          <button
            className="ab"
            onClick={() => onDone(item.entity_id)}
            title="Done for today"
          >
            <IconCheck size={12} />
            Done today
          </button>

          <div className="relative" ref={snoozeRef}>
            <button
              className="ab"
              onClick={() => { setShowSnooze((v) => !v); setSnoozeDate(minSnooze); }}
              title="Snooze"
            >
              <IconBellOff size={12} />
              Snooze
            </button>

            {showSnooze && (
              <div
                className="absolute z-10 mt-1  p-3 "
                style={{ background: "var(--color-white)", border: "0.5px solid rgba(26,26,24,0.16)", left: 0, top: "100%", minWidth: 200 }}
              >
                <p className="text-[11px] mb-2" style={{ color: "var(--color-ink-60)" }}>
                  Snooze until:
                </p>
                <input
                  type="date"
                  value={snoozeDate}
                  min={minSnooze}
                  onChange={(e) => setSnoozeDate(e.target.value)}
                  className="w-full text-[12px]  px-2 py-1 outline-none mb-2"
                  style={{ border: "0.5px solid rgba(26,26,24,0.2)", color: "var(--color-ink)" }}
                />
                <button
                  className="ab w-full justify-center"
                  disabled={!snoozeDate}
                  onClick={() => {
                    if (snoozeDate) {
                      onSnooze(item.entity_id, snoozeDate);
                      setShowSnooze(false);
                    }
                  }}
                >
                  Confirm snooze
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Priority rank */}
      <div className="text-[11px] pt-0.5 whitespace-nowrap" style={{ color: "var(--color-ink-30)" }}>
        #{item.priority_rank}
      </div>
    </div>
  );
}

// ─── activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: RecentInteraction }) {
  const entity = item.candidate_name ?? item.client_name ?? "—";
  const typeLabel =
    item.interaction_type === "call" ? "Call"
    : item.interaction_type === "email" ? "Email"
    : item.interaction_type === "meeting" ? "Meeting"
    : item.interaction_type;

  return (
    <div
      className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}
    >
      <span
        className="text-[11px] font-medium px-2 py-0.5  mt-0.5 shrink-0"
        style={{ background: "var(--color-ink-10)", color: "var(--color-ink-60)" }}
      >
        {typeLabel}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[12px] font-medium">{entity}</span>
        {item.summary && (
          <span className="text-[12px] ml-1.5" style={{ color: "var(--color-ink-60)" }}>
            — {item.summary}
          </span>
        )}
      </div>
      <span className="text-[11px] shrink-0 pt-0.5" style={{ color: "var(--color-ink-30)" }}>
        {relativeTime(item.interacted_at)}
      </span>
    </div>
  );
}

function EmptyAgenda() {
  const navigate = useNavigate();
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
        No priority actions today.
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-60)" }}>
        All your processes are on track.
      </p>
      <button
        className="mt-4 ab mx-auto"
        onClick={() => void navigate({ to: "/candidates", search: () => BLANK_CANDIDATE_SEARCH })}
      >
        <IconArrowRight size={12} />
        Go to candidates
      </button>
    </div>
  );
}

// ─── saved lists widget ───────────────────────────────────────────────────────

type DashboardList = {
  id: string;
  name: string;
  created_by: string;
  visibility: string;
  candidate_ids: string[];
  updated_at: string;
  creator_name: string | null;
};

function SavedListsWidget({ recruiterId }: { recruiterId: string }) {
  const navigate = useNavigate();

  const lists = useQuery({
    queryKey: ["candidate-lists"],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<DashboardList[]> => {
      const { data, error } = await supabase
        .from("candidate_lists")
        .select("id, name, created_by, visibility, candidate_ids, updated_at, recruiters ( full_name )")
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) {
        // table not yet migrated — return empty
        return [];
      }
      return (data ?? []).map((row: {
        id: string; name: string; created_by: string; visibility: string;
        candidate_ids: string[]; updated_at: string;
        recruiters: { full_name: string | null } | null;
      }) => ({
        ...row,
        creator_name: row.recruiters?.full_name ?? null,
      }));
    },
  });

  // Filter: show own private lists + all team lists (hide others' private lists)
  const visible = (lists.data ?? []).filter(
    (l) => l.visibility === "team" || l.created_by === recruiterId,
  );

  return (
    <div className="bg-card  p-5" style={{ border: "0.5px solid var(--color-ink-15)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="sl">Saved candidate lists</p>
        <button
          className="text-[11px] transition-colors flex items-center gap-1"
          style={{ color: "var(--color-indigo)" }}
          onClick={() => void navigate({ to: "/advanced-search" as never })}
        >
          View all <IconArrowRight size={11} />
        </button>
      </div>

      {lists.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      )}

      {!lists.isLoading && visible.length === 0 && (
        <div>
          <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No saved lists yet.</p>
          <button
            className="mt-2 text-[12px] flex items-center gap-1 transition-colors"
            style={{ color: "var(--color-indigo)" }}
            onClick={() => void navigate({ to: "/advanced-search" as never })}
          >
            <IconArrowRight size={12} />
            Open Advanced Search to create lists
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((list) => (
            <div
              key={list.id}
              className="flex items-center gap-2.5 py-1.5"
              style={{ borderBottom: "0.5px solid rgba(26,26,24,0.07)" }}
            >
              {list.visibility === "private" ? (
                <IconLock size={12} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
              ) : (
                <IconWorld size={12} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-ink)" }}>
                  {list.name}
                </p>
                <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                  {list.candidate_ids.length} candidates
                  {list.creator_name ? ` · ${list.creator_name}` : ""}
                </p>
              </div>
              <span className="text-[11px] shrink-0" style={{ color: "var(--color-ink-30)" }}>
                {relativeTime(list.updated_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

