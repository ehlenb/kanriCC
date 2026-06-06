import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatYen, isCcmStage } from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconSearch,
  IconBriefcase,
  IconBuilding,
  IconCurrencyYen,
  IconChevronRight,
} from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/jobs")({
  component: JobsDashboard,
});

// ─── types ────────────────────────────────────────────────────────────────────

type JobProcess = { id: string; stage: string };

type Job = {
  id: string;
  title: string;
  is_open: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_stretch: number | null;
  urgency: string | null;
  created_at: string;
  clients: { id: string; company_name: string; fee_pct: number | null } | null;
  processes: JobProcess[];
};

// ─── data hook ────────────────────────────────────────────────────────────────

function useJobs(recruiterId: string) {
  return useQuery({
    queryKey: ["jobs", recruiterId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<Job[]> => {
      const { data, error } = await supabase
        .from("requisitions")
        .select(
          `id, title, is_open, salary_min, salary_max, salary_stretch, urgency, created_at,
           clients ( id, company_name, fee_pct ),
           processes ( id, stage )`,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        clients: Array.isArray(r.clients) ? r.clients[0] ?? null : r.clients,
        processes: (r.processes ?? []) as JobProcess[],
      })) as Job[];
    },
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function expectedFee(job: Job): number | null {
  const base = job.salary_stretch ?? job.salary_max ?? null;
  const feePct = job.clients?.fee_pct ?? null;
  if (!base || !feePct) return null;
  return Math.round((base * feePct) / 100);
}

function urgencyOrder(u: string | null): number {
  const m: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  return m[u ?? "normal"] ?? 2;
}

// ─── component ───────────────────────────────────────────────────────────────

function JobsDashboard() {
  const { user } = useAuth();
  const recruiterId = user!.id;
  const { data: allJobs = [], isLoading } = useJobs(recruiterId);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return allJobs;
    return allJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        (j.clients?.company_name ?? "").toLowerCase().includes(q),
    );
  }, [allJobs, search]);

  const openJobs = filtered
    .filter((j) => j.is_open)
    .sort((a, b) => urgencyOrder(a.urgency) - urgencyOrder(b.urgency));

  // Closed jobs — current quarter only
  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const closedJobs = filtered.filter(
    (j) => !j.is_open && new Date(j.created_at) >= qStart,
  );

  // Forecasting: sum expected fees across all open jobs
  const forecastTotal = allJobs
    .filter((j) => j.is_open)
    .reduce((sum, j) => sum + (expectedFee(j) ?? 0), 0);

  return (
    <div className="px-8 py-7 max-w-5xl">
      {/* Header row */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium mb-0.5">Jobs</h1>
          <p className="text-[13px]" style={{ color: "#5f5e5a" }}>
            All open and recently closed requisitions
          </p>
        </div>

        {/* Forecast chip */}
        {forecastTotal > 0 && (
          <div
            className=" px-4 py-3 text-right"
            style={{ background: "#eaf3de", border: "0.5px solid #c0dd97" }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-0.5" style={{ color: "#3b6d11" }}>
              Pipeline forecast
            </p>
            <p className="text-[22px] font-medium leading-none" style={{ color: "#27500a" }}>
              {formatYen(forecastTotal)}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#3b6d11" }}>
              aspirational billing · {openJobs.length} open job{openJobs.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2  px-3 py-2 mb-5"
        style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)", maxWidth: 360 }}
      >
        <IconSearch size={14} style={{ color: "#888780", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search by title or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "#1a1a18" }}
        />
      </div>

      {/* Open jobs */}
      <Section label={`Open jobs${openJobs.length ? ` · ${openJobs.length}` : ""}`}>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full " />)}
          </div>
        ) : openJobs.length === 0 ? (
          <EmptyState
            message={search ? "No open jobs match your search." : "No open jobs yet."}
            sub={search ? undefined : "Open a client and add a job to get started."}
          />
        ) : (
          <div className="space-y-2">
            {openJobs.map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        )}
      </Section>

      {/* Closed jobs */}
      {(closedJobs.length > 0 || (!isLoading && !search)) && (
        <Section label="Closed this quarter" className="mt-6">
          {isLoading ? (
            <Skeleton className="h-14 w-full " />
          ) : closedJobs.length === 0 ? (
            <EmptyState message="No jobs closed this quarter." />
          ) : (
            <div className="space-y-1.5">
              {closedJobs.map((j) => (
                <ClosedJobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ─── section wrapper ──────────────────────────────────────────────────────────

function Section({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="sl mb-2">{label}</p>
      {children}
    </div>
  );
}

// ─── job row ─────────────────────────────────────────────────────────────────

function JobRow({ job: j }: { job: Job }) {
  const navigate = useNavigate();

  const active = j.processes.filter((p) => !["Placed", "Closed lost"].includes(p.stage));
  const atOffer = active.filter((p) => p.stage === "Offer").length;
  const inInterview = active.filter((p) => isCcmStage(p.stage)).length;
  const cvSent = active.filter((p) => p.stage === "CV Sent").length;
  const buyIn = active.filter((p) => p.stage === "Buy-In").length;
  const specsOut = active.filter((p) => p.stage === "Specs Sent").length;

  const fee = expectedFee(j);

  const urgencyPill: Record<string, { label: string; bg: string; color: string }> = {
    critical: { label: "Critical", bg: "#fcebeb", color: "#a32d2d" },
    high:     { label: "High",     bg: "#faeeda", color: "#633806" },
    normal:   { label: "Normal",   bg: "#f5f5f3", color: "#888780" },
    low:      { label: "Low",      bg: "#f5f5f3", color: "#888780" },
  };
  const urgency = urgencyPill[j.urgency ?? "normal"] ?? urgencyPill.normal;

  return (
    <button
      className="w-full text-left  p-4 transition-colors"
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#fafaf9"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
      onClick={() => navigate({ to: "/jobs/$id", params: { id: j.id } })}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center  mt-0.5"
          style={{ background: "#e6f1fb" }}
        >
          <IconBriefcase size={16} style={{ color: "#185fa5" }} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[14px] font-medium">{j.title}</span>
            <span
              className="text-[11px] px-[7px] py-[2px] rounded font-medium"
              style={{ background: urgency.bg, color: urgency.color }}
            >
              {urgency.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[12px] mb-2" style={{ color: "#5f5e5a" }}>
            <IconBuilding size={12} />
            <span>{j.clients?.company_name ?? "—"}</span>
            {(j.salary_min || j.salary_max) && (
              <>
                <span style={{ color: "rgba(26,26,24,0.25)" }}>·</span>
                <IconCurrencyYen size={12} />
                <span>{formatYen(j.salary_min)}–{formatYen(j.salary_max)}</span>
              </>
            )}
            {fee && (
              <>
                <span style={{ color: "rgba(26,26,24,0.25)" }}>·</span>
                <span style={{ color: "#27500a" }}>Est. fee {formatYen(fee)}</span>
              </>
            )}
          </div>

          {/* Pipeline badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {active.length === 0 ? (
              <PipelinePill bg="#f5f5f3" color="#888780">No pipeline</PipelinePill>
            ) : (
              <>
                {atOffer > 0 && (
                  <PipelinePill bg="#faeeda" color="#633806" border="#ef9f27">
                    {atOffer} at offer
                  </PipelinePill>
                )}
                {inInterview > 0 && (
                  <PipelinePill bg="#e6f1fb" color="#185fa5">
                    {inInterview} interviewing
                  </PipelinePill>
                )}
                {cvSent > 0 && (
                  <PipelinePill bg="#f5f5f3" color="#5f5e5a">
                    {cvSent} CV sent
                  </PipelinePill>
                )}
                {buyIn > 0 && (
                  <PipelinePill bg="#faeeda" color="#633806">
                    {buyIn} buy-in
                  </PipelinePill>
                )}
                {specsOut > 0 && (
                  <PipelinePill bg="#f5f5f3" color="#888780">
                    {specsOut} pitched
                  </PipelinePill>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chevron */}
        <IconChevronRight size={16} style={{ color: "#b8b7b2", flexShrink: 0, marginTop: 2 }} />
      </div>
    </button>
  );
}

// ─── closed job row ───────────────────────────────────────────────────────────

function ClosedJobRow({ job: j }: { job: Job }) {
  const placed = j.processes.filter((p) => p.stage === "Placed").length;
  return (
    <div
      className="flex items-center gap-3  px-4 py-2.5"
      style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: "#5f5e5a" }}>{j.title}</span>
        <span className="text-[12px] ml-2" style={{ color: "#888780" }}>
          {j.clients?.company_name ?? "—"}
        </span>
      </div>
      {placed > 0 && (
        <StageBadge stage="Placed" className="text-[11px] py-0" />
      )}
      <span className="text-[11px]" style={{ color: "#b8b7b2" }}>Closed</span>
    </div>
  );
}

// ─── shared helpers ───────────────────────────────────────────────────────────

function PipelinePill({
  children,
  bg,
  color,
  border,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
  border?: string;
}) {
  return (
    <span
      className="text-[11px] font-medium px-[7px] py-[2px] rounded"
      style={{
        background: bg,
        color,
        border: `0.5px solid ${border ?? "rgba(26,26,24,0.12)"}`,
      }}
    >
      {children}
    </span>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div
      className=" px-5 py-8 text-center"
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <p className="text-[13px] font-medium" style={{ color: "#1a1a18" }}>{message}</p>
      {sub && <p className="text-[12px] mt-1" style={{ color: "#888780" }}>{sub}</p>}
    </div>
  );
}
