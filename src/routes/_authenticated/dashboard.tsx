import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  greetingByHour,
  todayFormatted,
  stageOrder,
  relativeTime,
  initials,
} from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSparkles } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// ─── types ───────────────────────────────────────────────────────────────────

type PriorityProcess = {
  processId: string;
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  clientName: string;
  reqTitle: string;
  stage: string;
  lastContactAt: string | null;
  aiSnapshot: string | null;
  riskCount: number;
};

type StatCards = {
  buyIn: number;
  cvsSent: number;
  activeInterviews: number;
  offers: number;
  placed: number;
};

// ─── data hooks ──────────────────────────────────────────────────────────────

function useDashboardStats(recruiterId: string) {
  return useQuery({
    queryKey: ["dashboard-stats", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<StatCards> => {
      const { data: processes } = await supabase
        .from("processes")
        .select("id, stage")
        .eq("owner_recruiter_id", recruiterId);

      const all = processes ?? [];
      const INTERVIEW_STAGES = ["1st interview", "2nd interview", "Final interview"];

      return {
        buyIn: all.filter((p) => p.stage === "Buy-in targeting").length,
        cvsSent: all.filter(
          (p) => !["Buy-in targeting", "Closed won", "Closed lost"].includes(p.stage),
        ).length,
        activeInterviews: all.filter((p) => INTERVIEW_STAGES.includes(p.stage)).length,
        offers: all.filter((p) => p.stage === "Offer").length,
        placed: all.filter((p) => p.stage === "Closed won").length,
      };
    },
  });
}

function usePriorityProcesses(recruiterId: string) {
  return useQuery({
    queryKey: ["priority-processes", recruiterId],
    queryFn: async (): Promise<PriorityProcess[]> => {
      const { data, error } = await supabase
        .from("processes")
        .select(
          `
          id,
          stage,
          ai_snapshot,
          updated_at,
          candidates (
            id,
            full_name,
            current_title,
            current_company
          ),
          requisitions (
            title,
            clients ( company_name )
          )
        `,
        )
        .eq("owner_recruiter_id", recruiterId)
        .not("stage", "in", '("Closed won","Closed lost")')
        .order("updated_at", { ascending: true })
        .limit(10);

      if (error) throw error;
      if (!data) return [];

      return data
        .map((p): PriorityProcess | null => {
          const cand = Array.isArray(p.candidates)
            ? p.candidates[0]
            : p.candidates;
          const req = Array.isArray(p.requisitions)
            ? p.requisitions[0]
            : p.requisitions;
          const client = Array.isArray(req?.clients)
            ? req?.clients[0]
            : req?.clients;

          if (!cand || !req) return null;

          return {
            processId: p.id,
            candidateId: cand.id,
            candidateName: cand.full_name,
            currentTitle: cand.current_title,
            currentCompany: cand.current_company,
            clientName: client?.company_name ?? "—",
            reqTitle: req.title,
            stage: p.stage,
            lastContactAt: p.updated_at,
            aiSnapshot: p.ai_snapshot,
            riskCount: 0,
          };
        })
        .filter((p): p is PriorityProcess => p !== null)
        .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));
    },
  });
}

// ─── component ───────────────────────────────────────────────────────────────

function Dashboard() {
  const { user } = useAuth();
  const recruiterId = user!.id;

  const stats = useDashboardStats(recruiterId);
  const priority = usePriorityProcesses(recruiterId);

  return (
    <div className="px-8 py-7 max-w-6xl">
      {/* Header */}
      <h1 className="text-xl font-medium mb-0.5">{greetingByHour()}</h1>
      <p className="text-[13px] mb-4" style={{ color: "#5f5e5a" }}>
        {todayFormatted()}
        &nbsp;&middot;&nbsp;Here is what needs your attention today
      </p>

      {/* Stat cards — 7 pipeline metrics */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        <StatCard loading={false} value="—" label="Specs sent" />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.buyIn ?? 0}
          label="Buy-in"
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.cvsSent ?? 0}
          label="CVs sent"
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.activeInterviews ?? 0}
          label="Interviews"
          tone="info"
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.offers ?? 0}
          label="Offers"
          tone={stats.data?.offers ? "gold" : undefined}
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.placed ?? 0}
          label="Placed"
          tone={stats.data?.placed ? "success" : undefined}
        />
        <StatCard loading={false} value="—" label="Billing (QTD)" />
      </div>

      {/* Priority actions — full width */}
      <div
        className="bg-card rounded-xl p-5"
        style={{ border: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <p className="sl mb-3">Priority actions — ranked by urgency</p>

        {priority.isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {!priority.isLoading && priority.data?.length === 0 && (
          <EmptyPriority />
        )}

        {priority.data?.map((p) => (
          <CandidateRow key={p.processId} process={p} />
        ))}
      </div>
    </div>
  );
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({
  loading,
  value,
  label,
  tone,
}: {
  loading: boolean;
  value: number | string;
  label: string;
  tone?: "danger" | "warning" | "info" | "success" | "gold";
}) {
  const valueColor =
    tone === "danger" ? "#a32d2d"
    : tone === "warning" ? "#633806"
    : tone === "info" ? "#185fa5"
    : tone === "success" ? "#27500a"
    : tone === "gold" ? "#633806"
    : "#1a1a18";

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "#f5f5f3" }}
    >
      {loading ? (
        <Skeleton className="h-7 w-8 mb-1" />
      ) : (
        <div className="text-xl font-medium leading-tight" style={{ color: valueColor }}>
          {value}
        </div>
      )}
      <div className="text-[11px] mt-0.5" style={{ color: "#5f5e5a" }}>
        {label}
      </div>
    </div>
  );
}

// ─── candidate row ────────────────────────────────────────────────────────────

function CandidateRow({ process: p }: { process: PriorityProcess }) {
  const navigate = useNavigate();
  const days = p.lastContactAt
    ? Math.floor((Date.now() - new Date(p.lastContactAt).getTime()) / 86_400_000)
    : null;

  const avatarBg =
    stageOrder(p.stage) <= 1
      ? { bg: "#fcebeb", color: "#a32d2d" }
      : stageOrder(p.stage) <= 3
        ? { bg: "#faeeda", color: "#633806" }
        : { bg: "#f5f5f3", color: "#5f5e5a" };

  return (
    <div
      className="grid py-3"
      style={{
        gridTemplateColumns: "36px 1fr auto",
        gap: 12,
        alignItems: "flex-start",
        borderBottom: "0.5px solid rgba(26,26,24,0.12)",
      }}
    >
      {/* Avatar */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
        style={{ background: avatarBg.bg, color: avatarBg.color }}
      >
        {initials(p.candidateName)}
      </div>

      {/* Content */}
      <div>
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[13px] font-medium">{p.candidateName}</span>
          <span className="text-[12px]" style={{ color: "#5f5e5a" }}>
            {p.reqTitle} → {p.clientName}
          </span>
        </div>

        {/* Badges */}
        <div className="flex gap-1.5 flex-wrap mb-2">
          <StageBadge stage={p.stage} />
          {days !== null && days > 7 && (
            <span
              className="inline-block text-[11px] font-medium px-2 py-0.5 rounded"
              style={{
                background: "#faeeda",
                color: "#633806",
              }}
            >
              {days}d no contact
            </span>
          )}
        </div>

        {/* AI snapshot */}
        {p.aiSnapshot ? (
          <p
            className="text-[13px] leading-snug mb-2"
            style={{ color: "#1a1a18" }}
          >
            {p.aiSnapshot}
          </p>
        ) : (
          <p
            className="text-[13px] leading-snug mb-2"
            style={{ color: "#888780" }}
          >
            No snapshot yet —{" "}
            <button
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: "#185fa5" }}
            >
              generate one
            </button>
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-1.5 flex-wrap">
          <ActionBtn
            icon={<IconSparkles size={12} />}
            onClick={() => navigate({ to: "/candidates/$id", params: { id: p.candidateId } })}
          >
            Full profile
          </ActionBtn>
        </div>
      </div>

      {/* Last contact */}
      <div
        className="text-[11px] pt-0.5 whitespace-nowrap"
        style={{ color: "#888780" }}
      >
        {relativeTime(p.lastContactAt)}
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  children,
  onClick,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button className="ab" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function EmptyPriority() {
  const navigate = useNavigate();
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium" style={{ color: "#1a1a18" }}>
        No active processes yet.
      </p>
      <p className="mt-1 text-xs" style={{ color: "#5f5e5a" }}>
        Add a candidate and create a process to see priority actions here.
      </p>
      <button
        className="mt-4 ab mx-auto"
        onClick={() => navigate({ to: "/candidates" })}
      >
        Go to candidates
      </button>
    </div>
  );
}

