import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  greetingByHour,
  todayFormatted,
  stageOrder,
  formatYen,
  relativeTime,
  initials,
} from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSearch, IconSparkles } from "@tabler/icons-react";

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
  activeCandidates: number;
  openReqs: number;
  riskFlags: number;
  overdueFollowUps: number;
};

// ─── data hooks ──────────────────────────────────────────────────────────────

function useDashboardStats(recruiterId: string) {
  return useQuery({
    queryKey: ["dashboard-stats", recruiterId],
    queryFn: async (): Promise<StatCards> => {
      const [{ count: activeCandidates }, { count: openReqs }, { data: processes }] =
        await Promise.all([
          supabase
            .from("candidates")
            .select("*", { count: "exact", head: true })
            .eq("recruiter_id", recruiterId),
          supabase
            .from("requisitions")
            .select("*", { count: "exact", head: true })
            .eq("recruiter_id", recruiterId)
            .eq("is_open", true),
          supabase
            .from("processes")
            .select("id, stage, updated_at")
            .eq("owner_recruiter_id", recruiterId)
            .not("stage", "in", '("Closed won","Closed lost")'),
        ]);

      const now = Date.now();
      const day = 86_400_000;
      const overdueFollowUps =
        processes?.filter((p) => {
          const d = p.updated_at ? now - new Date(p.updated_at).getTime() : Infinity;
          return d > 7 * day;
        }).length ?? 0;

      return {
        activeCandidates: activeCandidates ?? 0,
        openReqs: openReqs ?? 0,
        riskFlags: 0,
        overdueFollowUps,
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

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.activeCandidates ?? 0}
          label="Active candidates"
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.openReqs ?? 0}
          label="Open requisitions"
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.riskFlags ?? 0}
          label="Risk flags"
          tone="danger"
        />
        <StatCard
          loading={stats.isLoading}
          value={stats.data?.overdueFollowUps ?? 0}
          label="Follow-ups overdue"
          tone="warning"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "1.85fr 1fr" }}>
        {/* Left — priority actions */}
        <div>
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

        {/* Right — market data + client intel */}
        <div className="space-y-3">
          <MarketSalaries />
          <ClientPackageIntel recruiterId={recruiterId} />
        </div>
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
  value: number;
  label: string;
  tone?: "danger" | "warning";
}) {
  const valueColor =
    tone === "danger"
      ? "#a32d2d"
      : tone === "warning"
        ? "#633806"
        : "#1a1a18";

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "#f5f5f3" }}
    >
      {loading ? (
        <Skeleton className="h-7 w-10 mb-1" />
      ) : (
        <div className="text-2xl font-medium" style={{ color: valueColor }}>
          {value}
        </div>
      )}
      <div className="text-[11px]" style={{ color: "#5f5e5a", marginTop: 2 }}>
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

// ─── right column ─────────────────────────────────────────────────────────────

const MARKET_RANGES = [
  { role: "Finance Manager, banking", range: "¥8–15M" },
  { role: "Financial Planning Manager", range: "¥12–18M" },
  { role: "SCM Director, East Japan", range: "¥15–40M" },
  { role: "Marketing Director, FMCG", range: "¥15–25M" },
  { role: "Data Engineer, tech", range: "¥8–16M" },
  { role: "Robotics / Mfg Engineer", range: "¥8–16M" },
  { role: "Software Engineer (SWE3), tech", range: "¥10–22M" },
  { role: "HR Business Partner", range: "¥9–18M" },
];

function MarketSalaries() {
  return (
    <div
      className="bg-card rounded-xl p-5"
      style={{ border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <p className="sl mb-1">Japan market salary ranges</p>
      <p className="text-[11px] mb-3" style={{ color: "#888780" }}>
        Source: Robert Walters Japan 2026 + your placements
      </p>

      {MARKET_RANGES.map((r) => (
        <div
          key={r.role}
          className="flex justify-between text-[12px] py-1.5"
          style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}
        >
          <span style={{ color: "#5f5e5a" }}>{r.role}</span>
          <span className="font-medium ml-3 shrink-0">{r.range}</span>
        </div>
      ))}

      <button
        className="ab w-full justify-center mt-3"
      >
        <IconSearch size={12} />
        Look up a role
      </button>
    </div>
  );
}

function ClientPackageIntel({ recruiterId }: { recruiterId: string }) {
  const { data: clients } = useQuery({
    queryKey: ["client-package-intel", recruiterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select(`
          id,
          company_name,
          client_package_intelligence (
            base_pct_of_total,
            bonus_type,
            last_bonus_payout_pct,
            has_rsu,
            confirmed_stretch
          )
        `)
        .eq("recruiter_id", recruiterId)
        .limit(3);
      return data ?? [];
    },
  });

  return (
    <div
      className="bg-card rounded-xl p-5"
      style={{ border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <p className="sl mb-3">Client package intelligence</p>

      {!clients || clients.length === 0 ? (
        <p className="text-[12px]" style={{ color: "#888780" }}>
          No clients yet. Add a client and log a meeting note to auto-fill
          package intelligence.
        </p>
      ) : (
        clients.map((c, i) => {
          const pkg = Array.isArray(c.client_package_intelligence)
            ? c.client_package_intelligence[0]
            : c.client_package_intelligence;

          return (
            <div key={c.id}>
              {i > 0 && (
                <div
                  className="my-3"
                  style={{ borderTop: "0.5px solid rgba(26,26,24,0.12)" }}
                />
              )}
              <p className="text-[12px] font-medium mb-2">{c.company_name}</p>
              <PkgRow label="Base %" value={pkg?.base_pct_of_total ? `${pkg.base_pct_of_total}% of total` : null} />
              <PkgRow label="Bonus" value={pkg?.bonus_type} />
              <PkgRow
                label="Last bonus payout"
                value={pkg?.last_bonus_payout_pct ? `${pkg.last_bonus_payout_pct}% of target` : null}
              />
              <PkgRow
                label="RSU / equity"
                value={pkg?.has_rsu === true ? "Yes" : pkg?.has_rsu === false ? "Not at this level" : null}
              />
              <PkgRow
                label="Stretch confirmed"
                value={formatYen(pkg?.confirmed_stretch)}
              />
              {!pkg && (
                <p className="text-[11px] mt-2" style={{ color: "#888780" }}>
                  Log a client meeting note to auto-fill missing fields
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function PkgRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div
      className="flex justify-between text-[13px] py-1.5"
      style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}
    >
      <span style={{ color: "#5f5e5a" }}>{label}</span>
      <span style={{ color: value ? "#1a1a18" : "#888780" }}>
        {value ?? "N/A — not yet logged"}
      </span>
    </div>
  );
}
