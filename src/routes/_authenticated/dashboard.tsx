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

type PipelineCounts = {
  specsSent: number;
  buyIn: number;
  cvSent: number;
  interviewing: number;
  offer: number;
  placed: number;
};

type KpiData = {
  cvsSentMonth: number;
  offersMonth: number;
  placementsMonth: number;
  specsOutNow: number;
  activeInterviews: number;
};

type RecentInteraction = {
  id: string;
  interaction_type: string;
  summary: string | null;
  interacted_at: string;
  candidate_name: string | null;
  client_name: string | null;
};

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

function usePipelineCounts(recruiterId: string) {
  return useQuery({
    queryKey: ["pipeline-counts", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<PipelineCounts> => {
      const { data } = await supabase
        .from("processes")
        .select("stage")
        .eq("owner_recruiter_id", recruiterId)
        .not("stage", "in", '("Placed","Closed lost")');

      const all = data ?? [];
      return {
        specsSent: all.filter((p) => p.stage === "Specs Sent").length,
        buyIn: all.filter((p) => p.stage === "Buy-In").length,
        cvSent: all.filter((p) => p.stage === "CV Sent").length,
        interviewing: all.filter((p) => /^CCM\d+$/.test(p.stage)).length,
        offer: all.filter((p) => p.stage === "Offer").length,
        placed: all.filter((p) => p.stage === "Placed").length,
      };
    },
  });
}

function useKpi(recruiterId: string) {
  return useQuery({
    queryKey: ["kpi", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<KpiData> => {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [{ data: procs }, { data: allActive }] = await Promise.all([
        supabase
          .from("processes")
          .select("stage, cv_sent_at, offer_date, placed_date, created_at")
          .eq("owner_recruiter_id", recruiterId),
        supabase
          .from("processes")
          .select("stage")
          .eq("owner_recruiter_id", recruiterId)
          .not("stage", "in", '("Placed","Closed lost")'),
      ]);

      const p = procs ?? [];
      const a = allActive ?? [];

      return {
        cvsSentMonth: p.filter((x) => x.cv_sent_at && x.cv_sent_at >= firstOfMonth).length,
        offersMonth: p.filter((x) => x.offer_date && x.offer_date >= firstOfMonth).length,
        placementsMonth: p.filter((x) => x.placed_date && x.placed_date >= firstOfMonth).length,
        specsOutNow: a.filter((x) => x.stage === "Specs Sent").length,
        activeInterviews: a.filter((x) => /^CCM\d+$/.test(x.stage)).length,
      };
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

// ─── component ───────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const recruiterId = user!.id;
  const navigate = useNavigate();

  const agenda = useDailyAgenda(recruiterId);
  const pipeline = usePipelineCounts(recruiterId);
  const kpi = useKpi(recruiterId);
  const activity = useRecentActivity(recruiterId);

  // Local ordered list — populated from API data, supports drag reorder and dismissal
  const [localItems, setLocalItems] = useState<AgendaItem[]>([]);

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

  return (
    <div className="px-8 py-7 max-w-6xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-medium mb-0.5">{greetingByHour()}</h1>
        <p className="text-[13px]" style={{ color: "#5f5e5a" }}>
          {todayFormatted()}&nbsp;&middot;&nbsp;Here is what needs your attention today
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-2">
        <KpiCard loading={kpi.isLoading} value={kpi.data?.cvsSentMonth ?? 0} label="CVs sent (MTD)" />
        <KpiCard loading={kpi.isLoading} value={kpi.data?.specsOutNow ?? 0} label="Specs active" />
        <KpiCard loading={kpi.isLoading} value={kpi.data?.activeInterviews ?? 0} label="In interviews" tone="info" />
        <KpiCard loading={kpi.isLoading} value={kpi.data?.offersMonth ?? 0} label="Offers (MTD)" tone={kpi.data?.offersMonth ? "gold" : undefined} />
        <KpiCard loading={kpi.isLoading} value={kpi.data?.placementsMonth ?? 0} label="Placed (MTD)" tone={kpi.data?.placementsMonth ? "success" : undefined} />
      </div>

      {/* Pipeline pulse */}
      <div className="rounded-xl p-4" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}>
        <p className="sl mb-3">Pipeline</p>
        {pipeline.isLoading ? (
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-24" />)}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <PulseChip label="Specs Sent" count={pipeline.data?.specsSent ?? 0} onClick={() => void navigate({ to: "/candidates", search: () => BLANK_CANDIDATE_SEARCH })} />
            <PulseChip label="Buy-In" count={pipeline.data?.buyIn ?? 0} tone="warning" onClick={() => void navigate({ to: "/candidates", search: () => BLANK_CANDIDATE_SEARCH })} />
            <PulseChip label="CV Sent" count={pipeline.data?.cvSent ?? 0} onClick={() => void navigate({ to: "/candidates", search: () => BLANK_CANDIDATE_SEARCH })} />
            <PulseChip label="Interviewing" count={pipeline.data?.interviewing ?? 0} tone="info" onClick={() => void navigate({ to: "/candidates", search: () => BLANK_CANDIDATE_SEARCH })} />
            <PulseChip label="Offer" count={pipeline.data?.offer ?? 0} tone="gold" onClick={() => void navigate({ to: "/candidates", search: () => BLANK_CANDIDATE_SEARCH })} />
          </div>
        )}
      </div>

      {/* Daily agenda */}
      <div className="bg-card rounded-xl p-5" style={{ border: "0.5px solid rgba(26,26,24,0.12)" }}>
        <p className="sl mb-3">Priority actions — ranked by urgency</p>

        {agenda.isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        )}

        {agenda.isError && (
          <p className="text-[13px]" style={{ color: "#a32d2d" }}>
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

      {/* Recent activity */}
      <div className="bg-card rounded-xl p-5" style={{ border: "0.5px solid rgba(26,26,24,0.12)" }}>
        <p className="sl mb-3">Your recent activity</p>

        {activity.isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        {!activity.isLoading && (activity.data?.length ?? 0) === 0 && (
          <p className="text-[13px]" style={{ color: "#888780" }}>No recent interactions logged.</p>
        )}

        {activity.data?.map((a) => (
          <ActivityRow key={a.id} item={a} />
        ))}
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  loading,
  value,
  label,
  tone,
}: {
  loading: boolean;
  value: number;
  label: string;
  tone?: "info" | "gold" | "success";
}) {
  const color =
    tone === "info" ? "#185fa5"
    : tone === "gold" ? "#633806"
    : tone === "success" ? "#27500a"
    : "#1a1a18";

  return (
    <div className="rounded-lg p-3" style={{ background: "#f5f5f3" }}>
      {loading ? (
        <Skeleton className="h-7 w-8 mb-1" />
      ) : (
        <div className="text-xl font-medium leading-tight" style={{ color }}>{value}</div>
      )}
      <div className="text-[11px] mt-0.5" style={{ color: "#5f5e5a" }}>{label}</div>
    </div>
  );
}

// ─── pipeline pulse chip ──────────────────────────────────────────────────────

function PulseChip({
  label,
  count,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  tone?: "warning" | "info" | "gold";
  onClick: () => void;
}) {
  const bg =
    tone === "warning" ? "#fdf3e7"
    : tone === "info" ? "#e6f1fb"
    : tone === "gold" ? "#fdf3e7"
    : "#ffffff";
  const textColor =
    tone === "warning" ? "#633806"
    : tone === "info" ? "#185fa5"
    : tone === "gold" ? "#633806"
    : "#1a1a18";

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
      style={{ background: bg, color: textColor, border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <span>{label}</span>
      <span
        className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: "rgba(26,26,24,0.08)" }}
      >
        {count}
      </span>
    </button>
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
    item.stage === "Offer" ? { bg: "#fcebeb", color: "#a32d2d" }
    : item.stage === "Buy-In" ? { bg: "#fdf3e7", color: "#633806" }
    : /^CCM\d+$/.test(item.stage ?? "") ? { bg: "#e6f1fb", color: "#185fa5" }
    : { bg: "#f5f5f3", color: "#5f5e5a" };

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
        borderBottom: "0.5px solid rgba(26,26,24,0.12)",
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

        <p className="text-[12px] mb-1.5 leading-snug" style={{ color: "#633806" }}>
          {item.reason}
        </p>

        <p className="text-[12px] mb-2 leading-snug" style={{ color: "#5f5e5a" }}>
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
                className="absolute z-10 mt-1 rounded-lg p-3 shadow-md"
                style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.16)", left: 0, top: "100%", minWidth: 200 }}
              >
                <p className="text-[11px] mb-2" style={{ color: "#5f5e5a" }}>
                  Snooze until:
                </p>
                <input
                  type="date"
                  value={snoozeDate}
                  min={minSnooze}
                  onChange={(e) => setSnoozeDate(e.target.value)}
                  className="w-full text-[12px] rounded px-2 py-1 outline-none mb-2"
                  style={{ border: "0.5px solid rgba(26,26,24,0.2)", color: "#1a1a18" }}
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
      <div className="text-[11px] pt-0.5 whitespace-nowrap" style={{ color: "#888780" }}>
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
      style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}
    >
      <span
        className="text-[11px] font-medium px-2 py-0.5 rounded mt-0.5 shrink-0"
        style={{ background: "#f5f5f3", color: "#5f5e5a" }}
      >
        {typeLabel}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[12px] font-medium">{entity}</span>
        {item.summary && (
          <span className="text-[12px] ml-1.5" style={{ color: "#5f5e5a" }}>
            — {item.summary}
          </span>
        )}
      </div>
      <span className="text-[11px] shrink-0 pt-0.5" style={{ color: "#888780" }}>
        {relativeTime(item.interacted_at)}
      </span>
    </div>
  );
}

function EmptyAgenda() {
  const navigate = useNavigate();
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium" style={{ color: "#1a1a18" }}>
        No priority actions today.
      </p>
      <p className="mt-1 text-xs" style={{ color: "#5f5e5a" }}>
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

