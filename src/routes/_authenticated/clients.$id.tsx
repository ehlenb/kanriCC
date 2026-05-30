import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatYen,
  initials,
} from "@/lib/candidate-utils";
import type { ContactRole } from "@/integrations/supabase/types";
import {
  IconArrowLeft,
  IconSparkles,
  IconPhone,
  IconMail,
  IconCalendar,
  IconPencil,
  IconPlus,
  IconFileText,
  IconCopy,
  IconCheck,
  IconEdit,
} from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

// ─── types ────────────────────────────────────────────────────────────────────

type ClientRecord = {
  id: string;
  company_name: string;
  logo_url: string | null;
  is_active: boolean;
  status: string | null;
  fee_pct: number | null;
  started_at: string | null;
  years_in_japan: number | null;
  japan_team_size: number | null;
  japan_team_japanese_pct: number | null;
  employee_japanese_pct: number | null;
  japan_role_in_group: string | null;
  kk_entity: string | null;
  strategy_notes: string | null;
  contract_signed: boolean;
  contract_url: string | null;
  ai_context: string | null;
  ai_context_updated_at: string | null;
};

type Contact = {
  id: string;
  name: string;
  role: ContactRole;
  title: string | null;
  notes: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  relationship_score: number | null;
  bypass_hr_warning: boolean | null;
  is_primary: boolean | null;
};

type PipelineProcess = {
  id: string;
  stage: string;
  coverage_type: string;
  updated_at: string;
  candidates: { id: string; full_name: string; full_name_japanese: string | null; current_title: string | null } | null;
};

type ReqWithPipeline = {
  id: string;
  title: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_stretch: number | null;
  is_open: boolean;
  is_backfill: boolean;
  interview_rounds: number | null;
  hiring_manager_id: string | null;
  why_role_opened: string | null;
  strategic_context: string | null;
  processes: PipelineProcess[];
};

type Interaction = {
  id: string;
  interaction_type: string;
  summary: string | null;
  full_notes: string | null;
  interacted_at: string;
  candidate_id: string | null;
};

// ─── action item type ─────────────────────────────────────────────────────────

type ActionPriority = "urgent" | "warning" | "info" | "nudge";
type ActionItem = {
  id: string;
  priority: ActionPriority;
  title: string;
  body: string;
  cta: string;
  /** Process context — set on triggers that relate to a specific candidate/process */
  processId?: string;
  candidateId?: string;
  /** Requisition context — set on triggers that relate to a specific req */
  reqId?: string;
};

// ─── data hook ────────────────────────────────────────────────────────────────

function useClientDetail(id: string) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const [
        { data: client, error },
        { data: contacts },
        { data: reqs },
        { data: interactions },
      ] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).single(),
        supabase
          .from("client_contacts")
          .select("id, name, role, title, notes, relationship_score, bypass_hr_warning, is_primary")
          .eq("client_id", id)
          .order("created_at"),
        supabase
          .from("requisitions")
          .select(
            `id, title, salary_min, salary_max, salary_stretch, is_open, is_backfill,
             interview_rounds, hiring_manager_id, why_role_opened, strategic_context,
             processes (
               id, stage, coverage_type, updated_at,
               candidates ( id, full_name, full_name_japanese, current_title )
             )`,
          )
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("interactions")
          .select("id, interaction_type, summary, full_notes, interacted_at, candidate_id")
          .eq("client_id", id)
          .order("interacted_at", { ascending: false })
          .limit(50),
      ]);
      if (error) throw error;
      return {
        client: client as ClientRecord,
        contacts: (contacts ?? []) as Contact[],
        reqs: (reqs ?? []) as ReqWithPipeline[],
        interactions: (interactions ?? []) as Interaction[],
      };
    },
  });
}

// ─── recommended actions decision tree ───────────────────────────────────────

function computeActions(
  reqs: ReqWithPipeline[],
  contacts: Contact[],
  interactions: Interaction[],
): ActionItem[] {
  const now = Date.now();
  const daysSince = (iso: string) =>
    Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));

  const allActive = reqs.flatMap((r) =>
    (r.processes ?? [])
      .filter((p) => !["Placed", "Closed lost"].includes(p.stage))
      .map((p) => ({ ...p, reqTitle: r.title, reqId: r.id })),
  );

  const items: ActionItem[] = [];

  // URGENT: CV Sent (awaiting client feedback) > 3 days
  allActive
    .filter((p) => p.stage === "CV Sent")
    .forEach((p) => {
      const d = daysSince(p.updated_at);
      if (d >= 3) {
        items.push({
          id: `cvfb-${p.id}`,
          priority: "urgent",
          title: "Awaiting client feedback on CV",
          body: `${p.candidates?.full_name ?? "Candidate"} submitted for ${p.reqTitle} — ${d} days with no response.`,
          cta: "Draft follow-up ↗",
          processId: p.id,
          candidateId: p.candidates?.id,
          reqId: p.reqId,
        });
      }
    });

  // URGENT: CCM stage, no update > 2 days
  allActive
    .filter((p) => /^CCM\d+$/.test(p.stage))
    .forEach((p) => {
      const d = daysSince(p.updated_at);
      if (d >= 2) {
        items.push({
          id: `intfb-${p.id}`,
          priority: "urgent",
          title: "Post-interview feedback outstanding",
          body: `${p.candidates?.full_name ?? "Candidate"} completed ${p.stage} for ${p.reqTitle}. Request feedback before the candidate cools.`,
          cta: "Draft follow-up ↗",
          processId: p.id,
          candidateId: p.candidates?.id,
          reqId: p.reqId,
        });
      }
    });

  // URGENT: Offer stage, no update > 2 days
  allActive
    .filter((p) => p.stage === "Offer")
    .forEach((p) => {
      const d = daysSince(p.updated_at);
      if (d >= 2) {
        items.push({
          id: `offer-${p.id}`,
          priority: "urgent",
          title: "Offer stage — no update",
          body: `${p.candidates?.full_name ?? "Candidate"} has been at offer for ${p.reqTitle} for ${d} days without a logged update.`,
          cta: "Closing script ↗",
          processId: p.id,
          candidateId: p.candidates?.id,
          reqId: p.reqId,
        });
      }
    });

  // WARNING: Buy-In — candidate consented, CV not yet submitted
  allActive
    .filter((p) => p.stage === "Buy-In")
    .forEach((p) => {
      items.push({
        id: `buyin-${p.id}`,
        priority: "warning",
        title: "Submit before another firm does",
        body: `${p.candidates?.full_name ?? "Candidate"} has given buy-in for ${p.reqTitle}. Draft the report now.`,
        cta: "Draft report ↗",
        processId: p.id,
        candidateId: p.candidates?.id,
        reqId: p.reqId,
      });
    });

  // WARNING: Open req with no candidates at all
  reqs
    .filter((r) => r.is_open)
    .forEach((r) => {
      const active = (r.processes ?? []).filter(
        (p) => !["Placed", "Closed lost"].includes(p.stage),
      );
      if (active.length === 0) {
        items.push({
          id: `empty-${r.id}`,
          priority: "warning",
          title: "No pipeline for open role",
          body: `${r.title} has no active candidates. Source before the client asks for an update.`,
          cta: "Source more ↗",
          reqId: r.id,
        });
      }
    });

  // INFO: Open req with low CV count (< 3 submitted)
  reqs
    .filter((r) => r.is_open)
    .forEach((r) => {
      const submitted = (r.processes ?? []).filter(
        (p) => !["Specs Sent", "Buy-In", "Closed lost"].includes(p.stage),
      );
      if (submitted.length > 0 && submitted.length < 3) {
        items.push({
          id: `thin-${r.id}`,
          priority: "info",
          title: "Thin pipeline",
          body: `${r.title} has only ${submitted.length} candidate${submitted.length === 1 ? "" : "s"} in the pipeline. Add more to reduce single-candidate risk.`,
          cta: "View req ↗",
          reqId: r.id,
        });
      }
    });

  // WARNING: CCM stage entered within 48h — prep candidate
  allActive
    .filter((p) => /^CCM\d+$/.test(p.stage))
    .forEach((p) => {
      const d = daysSince(p.updated_at);
      if (d < 2) {
        items.push({
          id: `prep-${p.id}`,
          priority: "warning",
          title: "Interview approaching — prep candidate",
          body: `${p.candidates?.full_name ?? "Candidate"} recently moved to ${p.stage} for ${p.reqTitle}. Send prep notes before they walk in.`,
          cta: "Draft prep ↗",
          processId: p.id,
          candidateId: p.candidates?.id,
          reqId: p.reqId,
        });
      }
    });

  // INFO: CCM stage, >4 days — next round not yet scheduled
  allActive
    .filter((p) => /^CCM\d+$/.test(p.stage))
    .forEach((p) => {
      const d = daysSince(p.updated_at);
      if (d >= 4) {
        items.push({
          id: `sched-${p.id}`,
          priority: "info",
          title: "Next round not scheduled",
          body: `${p.candidates?.full_name ?? "Candidate"} has been at ${p.stage} for ${p.reqTitle} for ${d} days without a next-round date logged.`,
          cta: "Draft scheduling message ↗",
          processId: p.id,
          candidateId: p.candidates?.id,
          reqId: p.reqId,
        });
      }
    });

  // INFO: Offer stage, <2 days old — pre-close should be logged now
  allActive
    .filter((p) => p.stage === "Offer")
    .forEach((p) => {
      const d = daysSince(p.updated_at);
      if (d < 2) {
        items.push({
          id: `preclose-${p.id}`,
          priority: "info",
          title: "Pre-close not yet logged",
          body: `${p.candidates?.full_name ?? "Candidate"} just reached offer stage for ${p.reqTitle}. Log a pre-close conversation before the client makes direct contact.`,
          cta: "Closing script ↗",
          processId: p.id,
          candidateId: p.candidates?.id,
          reqId: p.reqId,
        });
      }
    });

  // NUDGE: HR gatekeeper exists but no in-person meeting logged
  const hrContact = contacts.find((c) => c.role === "hr_gatekeeper");
  const hasMetHrInPerson = interactions.some((i) => i.interaction_type === "meeting");
  if (hrContact && !hasMetHrInPerson) {
    items.push({
      id: "hr-never-met",
      priority: "nudge",
      title: "HR contact — no in-person meeting logged",
      body: `You have not met ${hrContact.name} in person. A brief intro call now makes offers much easier when things get complicated.`,
      cta: "Schedule intro",
    });
  }

  // NUDGE: HM relationship score ≤ 2
  const hm = contacts.find((c) => c.role === "hiring_manager");
  if (hm && hm.relationship_score && hm.relationship_score <= 2) {
    items.push({
      id: "hm-nudge",
      priority: "nudge",
      title: "Strengthen HM relationship",
      body: `Your relationship with ${hm.name} is thin. A lunch or informal coffee helps when deals get complicated.`,
      cta: "Prep meeting ↗",
    });
  }

  // NUDGE: No logged interaction > 10 days
  if (interactions.length > 0) {
    const d = daysSince(interactions[0].interacted_at);
    if (d > 10) {
      items.push({
        id: "no-contact",
        priority: "nudge",
        title: "Check in — relationship maintenance",
        body: `No logged contact with this client in ${d} days. A quick touchpoint keeps the relationship active.`,
        cta: "Log call",
      });
    }
  } else {
    items.push({
      id: "first-contact",
      priority: "nudge",
      title: "No interactions logged yet",
      body: "Log your first interaction with this client to start tracking the relationship.",
      cta: "Log call",
    });
  }

  const order: Record<ActionPriority, number> = {
    urgent: 0,
    warning: 1,
    info: 2,
    nudge: 3,
  };
  return items.sort((a, b) => order[a.priority] - order[b.priority]);
}

// ─── completeness score ───────────────────────────────────────────────────────

function computeCompleteness(
  c: ClientRecord,
  contacts: Contact[],
  reqs: ReqWithPipeline[],
): { score: number; missing: string[] } {
  const checks: Array<[boolean, string]> = [
    [!!c.years_in_japan, "years in Japan"],
    [!!c.japan_team_size, "team size"],
    [!!c.japan_team_japanese_pct, "% Japanese nationals"],
    [!!(c.strategy_notes && c.strategy_notes.length > 50), "strategy notes"],
    [c.kk_entity !== null && c.kk_entity !== undefined, "KK entity status"],
    [!!c.japan_role_in_group, "Japan role in group"],
    [
      contacts.some((cc) => cc.role === "hiring_manager" && !!cc.notes),
      "hiring manager notes",
    ],
    [contacts.some((cc) => cc.role === "hr_gatekeeper"), "HR gatekeeper contact"],
    [reqs.some((r) => !!r.why_role_opened), "why role opened"],
    [
      reqs.some((r) => !!r.strategic_context && r.strategic_context.length > 80),
      "strategic context",
    ],
  ];

  const populated = checks.filter(([v]) => v);
  const missing = checks.filter(([v]) => !v).map(([, label]) => label);

  return { score: Math.round((populated.length / checks.length) * 100), missing };
}

// ─── main component ───────────────────────────────────────────────────────────

function ClientDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useClientDetail(id);
  const qc = useQueryClient();

  const [clientTab, setClientTab] = useState<"timeline" | "info" | "contract">("timeline");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addReqOpen, setAddReqOpen] = useState(false);
  const [logInteractionOpen, setLogInteractionOpen] = useState(false);
  const [logEventType, setLogEventType] = useState<"call" | "email" | "meeting">("call");
  const [snapshotData, setSnapshotData] = useState<{
    whereThingsStand: string;
    watchOut: string;
  } | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [draftModal, setDraftModal] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  if (isLoading) {
    return (
      <div style={{ background: "#eeede8", minHeight: "100vh" }}>
        <div className="h-12 bg-white" style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)" }} />
        <div className="px-6 pt-5 space-y-3 max-w-4xl">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data?.client) {
    return (
      <div style={{ background: "#eeede8", minHeight: "100vh" }} className="p-8 text-sm" >
        Client not found.
      </div>
    );
  }

  const { client: c, contacts, reqs, interactions } = data;
  const openReqs = reqs.filter((r) => r.is_open);
  const closedReqs = reqs.filter((r) => !r.is_open);
  const completeness = computeCompleteness(c, contacts, reqs);
  const actions = computeActions(reqs, contacts, interactions);

  // Stat computations
  const allProcesses = reqs.flatMap((r) => r.processes ?? []);
  const cvsSent = allProcesses.filter((p) => !["Specs Sent", "Buy-In", "Closed lost"].includes(p.stage)).length;
  const interviews = allProcesses.filter((p) => /^CCM\d+$/.test(p.stage)).length;
  const placements = allProcesses.filter((p) => p.stage === "Placed").length;
  const feedbackOverdue = actions.filter(
    (a) => a.priority === "urgent" && (a.id.startsWith("screening-") || a.id.startsWith("interview-")),
  ).length;

  async function generateSnapshot() {
    setLoadingSnapshot(true);
    try {
      const resp = await fetch("/api/ai/client-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id, recruiterId: user!.id }),
      });
      const json = await resp.json() as { whereThingsStand?: string; watchOut?: string };
      setSnapshotData({
        whereThingsStand: json.whereThingsStand ?? "",
        watchOut: json.watchOut ?? "",
      });
    } finally {
      setLoadingSnapshot(false);
    }
  }

  // Active pipeline (non-closed processes across open reqs)
  const activePipeline = openReqs.flatMap((r) =>
    (r.processes ?? [])
      .filter((p) => !["Placed", "Closed lost"].includes(p.stage))
      .map((p) => ({ ...p, reqTitle: r.title })),
  );

  async function generateMeetingPrep() {
    setDraftLoading(true);
    try {
      const resp = await fetch("/api/ai/client-meeting-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id, recruiterId: user!.id }),
      });
      const json = (await resp.json()) as { content?: string };
      if (json.content) setDraftModal({ title: "Meeting prep", content: json.content });
    } catch {
      toast.error("Failed to generate meeting prep");
    } finally {
      setDraftLoading(false);
    }
  }

  const DRAFT_TYPE_MAP: Record<string, string> = {
    "Draft follow-up ↗": "follow_up",
    "Draft prep ↗": "prep",
    "Closing script ↗": "closing",
    "Draft scheduling message ↗": "scheduling",
    "Draft report ↗": "report",
    "Schedule intro": "hr_intro",
  };

  async function handleCtaClick(item: ActionItem) {
    const { cta } = item;

    if (cta === "Log call") { setLogInteractionOpen(true); return; }
    if (cta === "Source more ↗" || cta === "View req ↗") {
      toast.info("Requisition view coming in the next build");
      return;
    }
    if (cta === "Prep meeting ↗") { void generateMeetingPrep(); return; }

    const draftType = DRAFT_TYPE_MAP[cta];
    if (!draftType) return;

    // hr_intro doesn't need a process
    if (draftType === "hr_intro") {
      setDraftLoading(true);
      try {
        const resp = await fetch("/api/ai/client-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftType, clientId: id, recruiterId: user!.id }),
        });
        const json = (await resp.json()) as { content?: string };
        if (json.content) setDraftModal({ title: "HR intro email", content: json.content });
      } catch {
        toast.error("Failed to generate draft");
      } finally {
        setDraftLoading(false);
      }
      return;
    }

    if (!item.processId) {
      toast.error("No process context — open the candidate profile to draft from there");
      return;
    }

    setDraftLoading(true);
    try {
      const resp = await fetch("/api/ai/client-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftType,
          processId: item.processId,
          clientId: id,
          recruiterId: user!.id,
        }),
      });
      const json = (await resp.json()) as { content?: string };
      if (json.content) {
        setDraftModal({ title: cta.replace(" ↗", ""), content: json.content });
      }
    } catch {
      toast.error("Failed to generate draft");
    } finally {
      setDraftLoading(false);
    }
  }

  return (
    <div style={{ background: "#eeede8", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        className="flex items-center gap-2 h-12 px-6 text-[13px]"
        style={{ background: "#fff", borderBottom: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <button
          onClick={() => navigate({ to: "/clients" })}
          className="flex items-center gap-1 transition-colors"
          style={{ color: "#888780" }}
        >
          <IconArrowLeft size={14} />
          Accounts
        </button>
        <span style={{ color: "rgba(26,26,24,0.3)" }}>/</span>
        <span className="font-medium">{c.company_name}</span>
        {!c.is_active && (
          <span
            className="ml-1 text-[11px] px-1.5 py-0.5 rounded"
            style={{ background: "#f5f5f3", color: "#888780" }}
          >
            Inactive
          </span>
        )}
      </div>

      {/* Client snapshot */}
      <div
        className="mx-6 mt-5 rounded-xl p-[14px_18px]"
        style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: "#5f5e5a" }}>
              Client snapshot
            </span>
            <span
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
            >
              ✦ AI generated
            </span>
          </div>
          {!snapshotData && (
            <button
              className="ab"
              onClick={generateSnapshot}
              disabled={loadingSnapshot}
            >
              <IconSparkles size={11} />
              {loadingSnapshot ? "Generating…" : "Generate snapshot"}
            </button>
          )}
          {snapshotData && (
            <button
              className="ab"
              onClick={generateSnapshot}
              disabled={loadingSnapshot}
            >
              <IconSparkles size={11} />
              {loadingSnapshot ? "Regenerating…" : "Refresh"}
            </button>
          )}
        </div>

        {snapshotData ? (
          <div className="grid grid-cols-3 gap-4">
            {/* Col 1: Where things stand */}
            <div>
              <p className="sl mb-1.5">Where things stand</p>
              <p className="text-[13px] leading-relaxed">{snapshotData.whereThingsStand}</p>
            </div>
            {/* Col 2: Active in process */}
            <div>
              <p className="sl mb-1.5">Active in process</p>
              {activePipeline.length === 0 ? (
                <p className="text-[13px]" style={{ color: "#888780" }}>
                  No active candidates with this client.
                </p>
              ) : (
                activePipeline.slice(0, 5).map((p) => (
                  <p key={p.id} className="text-[13px] mb-0.5">
                    <span className="font-medium">{p.candidates?.full_name ?? "—"}</span>
                    {" — "}
                    <span style={{ color: "#5f5e5a" }}>
                      {p.reqTitle} ({p.stage})
                    </span>
                  </p>
                ))
              )}
            </div>
            {/* Col 3: Watch out */}
            <div>
              <p className="sl mb-1.5">Watch out</p>
              <p className="text-[13px] leading-relaxed" style={{ color: "#a32d2d" }}>
                {snapshotData.watchOut}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "#888780" }}>
            Generate a snapshot to see where things stand, who is active, and what to watch for today.
          </p>
        )}
      </div>

      {/* Tab switcher */}
      <div
        className="flex gap-0 mx-6 mt-4"
        style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        {(
          [
            { key: "timeline", label: "Timeline" },
            { key: "info",     label: "Client info" },
            { key: "contract", label: "Contract" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setClientTab(key)}
            className="px-4 py-2 text-[13px] transition-colors"
            style={{
              borderBottom: clientTab === key ? "2px solid #1a1a18" : "2px solid transparent",
              color: clientTab === key ? "#1a1a18" : "#5f5e5a",
              fontWeight: clientTab === key ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TIMELINE TAB ── */}
      {clientTab === "timeline" && (
        <div
          className="grid gap-[14px] px-6 pb-8"
          style={{
            gridTemplateColumns: "minmax(0,1fr) 272px",
            paddingTop: 14,
            alignItems: "start",
          }}
        >
          <ClientTimelineTab interactions={interactions} />
          <div className="space-y-3">
            <RecommendedActionsPanel
              actions={actions}
              onLogCall={() => setLogInteractionOpen(true)}
              onCtaClick={(item) => void handleCtaClick(item)}
              draftLoading={draftLoading}
            />
            <QuickActionsCard
              onLogReq={() => setAddReqOpen(true)}
              onLogEvent={(type) => { setLogEventType(type); setLogInteractionOpen(true); }}
              onMeetingPrep={() => void generateMeetingPrep()}
              draftLoading={draftLoading}
            />
          </div>
        </div>
      )}

      {/* ── CLIENT INFO TAB ── */}
      {clientTab === "info" && (
        <div
          className="grid gap-[14px] px-6 pb-8"
          style={{
            gridTemplateColumns: "minmax(0,1fr) 272px",
            paddingTop: 14,
            alignItems: "start",
          }}
        >
          {/* ── LEFT COLUMN ── */}
          <div className="space-y-3">
            {/* Company header card */}
            <CompanyHeaderCard
              client={c}
              completeness={completeness}
              stats={{ cvsSent, interviews, placements, feedbackOverdue }}
              openReqsCount={openReqs.length}
              onSaveStrategy={(notes) => {
                void supabase
                  .from("clients")
                  .update({ strategy_notes: notes })
                  .eq("id", id)
                  .then(() => qc.invalidateQueries({ queryKey: ["client", id] }));
              }}
            />

            {/* Enrich company profile */}
            <ClientEnrichCard clientId={id} companyName={c.company_name} />

            {/* Account intelligence */}
            <ClientIntelligenceCard
              clientId={id}
              aiContext={c.ai_context}
              aiContextUpdatedAt={c.ai_context_updated_at}
            />

            {/* Contacts card */}
            <ContactsCard
              contacts={contacts}
              clientId={id}
              onAdd={() => setAddContactOpen(true)}
            />

            {/* Open jobs */}
            <OpenRequisitionsCard
              reqs={openReqs}
              closedReqs={closedReqs}
              contacts={contacts}
              onAdd={() => setAddReqOpen(true)}
            />
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="space-y-3">
            <RecommendedActionsPanel
              actions={actions}
              onLogCall={() => setLogInteractionOpen(true)}
              onCtaClick={(item) => void handleCtaClick(item)}
              draftLoading={draftLoading}
            />
            <QuickActionsCard
              onLogReq={() => setAddReqOpen(true)}
              onLogEvent={(type) => { setLogEventType(type); setLogInteractionOpen(true); }}
              onMeetingPrep={() => void generateMeetingPrep()}
              draftLoading={draftLoading}
            />
            <JapanMarketContextCard client={c} />
          </div>
        </div>
      )}

      {/* ── CONTRACT TAB ── */}
      {clientTab === "contract" && (
        <div className="px-6 pt-4 pb-8 max-w-xl">
          <ClientContractTab client={c} />
        </div>
      )}

      {/* Dialogs */}
      <AddContactDialog
        clientId={id}
        recruiterId={user!.id}
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
      />
      <RequisitionIntakeModal
        clientId={id}
        recruiterId={user!.id}
        open={addReqOpen}
        onClose={() => setAddReqOpen(false)}
      />
      <LogInteractionDialog
        clientId={id}
        recruiterId={user!.id}
        open={logInteractionOpen}
        onClose={() => setLogInteractionOpen(false)}
        initialType={logEventType}
      />
      <DraftModal
        draft={draftModal}
        onClose={() => setDraftModal(null)}
      />
    </div>
  );
}

// ─── card shell ───────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-[16px_18px] ${className}`}
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      {children}
    </div>
  );
}

function SL({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-medium uppercase tracking-[0.04em] mb-2"
      style={{ color: "#5f5e5a" }}
    >
      {children}
    </p>
  );
}

// ─── company header card ──────────────────────────────────────────────────────

function CompanyHeaderCard({
  client: c,
  completeness,
  stats,
  openReqsCount,
  onSaveStrategy,
}: {
  client: ClientRecord;
  completeness: { score: number; missing: string[] };
  stats: { cvsSent: number; interviews: number; placements: number; feedbackOverdue: number };
  openReqsCount: number;
  onSaveStrategy: (notes: string) => void;
}) {
  const [editingStrategy, setEditingStrategy] = useState(false);
  const [strategyDraft, setStrategyDraft] = useState(c.strategy_notes ?? "");

  function saveStrategy() {
    setEditingStrategy(false);
    onSaveStrategy(strategyDraft.trim() || "");
  }

  return (
    <Card>
      {/* Header row */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-medium"
          style={{ background: "#e6f1fb", color: "#185fa5" }}
        >
          {initials(c.company_name)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-medium leading-tight">{c.company_name}</h2>
          {/* Meta pills */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ClientStatusSelect
              clientId={c.id}
              currentStatus={c.status ?? "prospect"}
              contractSigned={c.contract_signed}
            />
            {c.contract_signed && (
              <MetaPill style={{ background: "#eaf3de", color: "#27500a", borderColor: "#c0dd97" }}>Contract signed</MetaPill>
            )}
            {c.employee_japanese_pct != null && (
              <MetaPill>
                {c.employee_japanese_pct}% Japanese team
              </MetaPill>
            )}
            {c.fee_pct && (
              <MetaPill>{c.fee_pct}% fee agreed</MetaPill>
            )}
            {c.started_at && (
              <MetaPill>
                Since{" "}
                {new Date(c.started_at).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                })}
              </MetaPill>
            )}
            {openReqsCount > 0 && (
              <MetaPill style={{ background: "#faeeda", color: "#633806", borderColor: "#fac775" }}>
                {openReqsCount} open job{openReqsCount !== 1 ? "s" : ""}
              </MetaPill>
            )}
          </div>
        </div>
        <button
          className="ab shrink-0"
          onClick={() => {
            // Navigate to edit — handled by parent; for now open edit via strategy section
            setEditingStrategy(true);
          }}
        >
          <IconPencil size={11} /> Edit
        </button>
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: "CVs sent", value: stats.cvsSent, color: undefined },
          { label: "Interviews", value: stats.interviews, color: undefined },
          {
            label: "Placements",
            value: stats.placements,
            color: stats.placements > 0 ? "#27500a" : undefined,
          },
          {
            label: "Feedback overdue",
            value: stats.feedbackOverdue,
            color: stats.feedbackOverdue > 0 ? "#a32d2d" : undefined,
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-[8px] p-[10px_12px]"
            style={{ background: "#f5f5f3" }}
          >
            <p
              className="text-[18px] font-medium leading-none mb-1"
              style={{ color: color ?? "#1a1a18" }}
            >
              {value}
            </p>
            <p className="text-[11px]" style={{ color: "#888780" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Completeness bar */}
      <div
        className="flex items-center gap-2 rounded-[6px] px-3 py-2 mb-3"
        style={{ background: "#e6f1fb" }}
      >
        <IconFileText size={14} style={{ color: "#185fa5" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px]" style={{ color: "#185fa5" }}>
            Client intel — {completeness.score}% complete
            {completeness.missing.length > 0 && (
              <span className="ml-1">
                · Missing: {completeness.missing.slice(0, 3).join(", ")}
                {completeness.missing.length > 3 && ` +${completeness.missing.length - 3} more`}
              </span>
            )}
          </p>
        </div>
        <div className="comp-bar shrink-0" style={{ width: 72, height: 4, background: "#b5d4f4", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: `${completeness.score}%`,
              height: "100%",
              background: "#185fa5",
              borderRadius: 2,
            }}
          />
        </div>
        <span className="text-[11px] font-medium shrink-0" style={{ color: "#185fa5" }}>
          {completeness.score}%
        </span>
      </div>

      {/* Strategy notes (inline editable) */}
      <div>
        <SL>Strategy notes</SL>
        {editingStrategy ? (
          <textarea
            autoFocus
            value={strategyDraft}
            onChange={(e) => setStrategyDraft(e.target.value)}
            onBlur={saveStrategy}
            className="w-full text-[13px] leading-[1.55] bg-transparent border-none outline-none resize-none"
            style={{ color: "#1a1a18" }}
            rows={4}
          />
        ) : (
          <p
            className="text-[13px] leading-[1.55] cursor-text"
            style={{ color: c.strategy_notes ? "#1a1a18" : "#888780" }}
            onClick={() => {
              setStrategyDraft(c.strategy_notes ?? "");
              setEditingStrategy(true);
            }}
          >
            {c.strategy_notes || "Click to add strategy notes — hiring plans, culture fit requirements, long-term relationship context."}
          </p>
        )}
      </div>
    </Card>
  );
}

function ClientStatusSelect({
  clientId,
  currentStatus,
  contractSigned,
}: {
  clientId: string;
  currentStatus: string;
  contractSigned: boolean;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ status: newStatus })
        .eq("id", clientId);
      if (error) throw error;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      if (newStatus === "active" && !contractSigned) {
        toast.warning("Status set to Active, but no contract is signed yet.");
      }
    },
    onError: () => toast.error("Could not update status. Try again."),
  });

  const styles: Record<string, React.CSSProperties> = {
    active:   { background: "#eaf3de", color: "#27500a", borderColor: "#c0dd97" },
    prospect: { background: "#fdf3e7", color: "#633806", borderColor: "#fac775" },
    inactive: { background: "#f5f5f3", color: "#888780", borderColor: "rgba(26,26,24,0.12)" },
  };
  const s = styles[currentStatus] ?? styles.prospect;

  return (
    <select
      value={currentStatus}
      disabled={mutation.isPending}
      onChange={(e) => {
        if (e.target.value !== currentStatus) mutation.mutate(e.target.value);
      }}
      className="text-[12px] font-medium rounded px-[7px] py-[2px] outline-none cursor-pointer"
      style={{ border: `0.5px solid ${s.borderColor ?? "rgba(26,26,24,0.12)"}`, ...s }}
    >
      <option value="prospect">Prospect</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  );
}

function MetaPill({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="text-[12px] px-[7px] py-[2px] rounded"
      style={{
        background: "#f5f5f3",
        border: "0.5px solid rgba(26,26,24,0.12)",
        color: "#5f5e5a",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── contacts card ────────────────────────────────────────────────────────────

const ROLE_AVATAR: Record<ContactRole, React.CSSProperties> = {
  hiring_manager: { background: "#e6f1fb", color: "#185fa5" },
  hr_gatekeeper: { background: "#f5f5f3", color: "#888780" },
  ta_coordinator: { background: "#faeeda", color: "#633806" },
  executive: { background: "#faeeda", color: "#633806" },
  other: { background: "#f5f5f3", color: "#888780" },
};

const ROLE_BADGE: Record<ContactRole, { label: string; style: React.CSSProperties }> = {
  hiring_manager: {
    label: "Decision maker",
    style: { background: "#e6f1fb", color: "#185fa5", borderColor: "#b5d4f4" },
  },
  hr_gatekeeper: {
    label: "HR gatekeeper",
    style: { background: "#f5f5f3", color: "#888780", borderColor: "rgba(26,26,24,0.12)" },
  },
  ta_coordinator: {
    label: "Scheduling owner",
    style: { background: "#faeeda", color: "#633806", borderColor: "#fac775" },
  },
  executive: {
    label: "Executive",
    style: { background: "#faeeda", color: "#633806", borderColor: "#fac775" },
  },
  other: {
    label: "Contact",
    style: { background: "#f5f5f3", color: "#888780", borderColor: "rgba(26,26,24,0.12)" },
  },
};

function ContactsCard({
  contacts,
  clientId,
  onAdd,
}: {
  contacts: Contact[];
  clientId: string;
  onAdd: () => void;
}) {
  const qc = useQueryClient();
  const [editingNote, setEditingNote] = useState<{ contactId: string; value: string } | null>(null);

  const updateScore = async (contactId: string, score: number) => {
    await supabase.from("client_contacts").update({ relationship_score: score }).eq("id", contactId);
    void qc.invalidateQueries({ queryKey: ["client", clientId] });
  };

  async function saveNote() {
    if (!editingNote) return;
    const trimmed = editingNote.value.trim();
    await supabase.from("client_contacts").update({ notes: trimmed || null }).eq("id", editingNote.contactId);
    void qc.invalidateQueries({ queryKey: ["client", clientId] });
    setEditingNote(null);
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SL>Contacts</SL>
        <button className="ab" onClick={onAdd}>
          <IconPlus size={11} /> Add
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-[13px]" style={{ color: "#888780" }}>
          No contacts added. Add your hiring manager and HR gatekeeper first.
        </p>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => {
            const avatarStyle = ROLE_AVATAR[contact.role];
            const badge = ROLE_BADGE[contact.role];

            return (
              <div key={contact.id}>
                {/* Gatekeeper warning */}
                {contact.role === "hr_gatekeeper" && contact.bypass_hr_warning && (
                  <div
                    className="text-[12px] px-3 py-2 rounded-[6px] mb-1.5 leading-snug"
                    style={{ background: "#faeeda", color: "#633806" }}
                  >
                    Do not send scheduling requests to the hiring manager directly — {contact.name} will notice and it creates friction.
                  </div>
                )}

                <div className="flex items-start gap-2.5">
                  {/* Avatar */}
                  <div
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
                    style={avatarStyle}
                  >
                    {initials(contact.name)}
                  </div>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[13px] font-medium">{contact.name}</span>
                      {contact.title && (
                        <span className="text-[12px]" style={{ color: "#888780" }}>
                          · {contact.title}
                        </span>
                      )}
                      <span
                        className="text-[11px] font-medium px-[7px] py-[2px] rounded border"
                        style={badge.style}
                      >
                        {badge.label}
                      </span>
                      {contact.is_primary && (
                        <span
                          className="text-[11px] font-medium px-[7px] py-[2px] rounded border"
                          style={{ background: "#faeeda", color: "#633806", borderColor: "#fac775" }}
                        >
                          Primary contact
                        </span>
                      )}
                    </div>

                    {/* Contact details */}
                    {(contact.email || contact.phone || contact.linkedin_url) && (
                      <div className="flex items-center gap-3 mt-0.5 mb-1">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="text-[11px]" style={{ color: "#185fa5" }}>{contact.email}</a>
                        )}
                        {contact.phone && (
                          <span className="text-[11px]" style={{ color: "#5f5e5a" }}>{contact.phone}</span>
                        )}
                        {contact.linkedin_url && (
                          <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-[11px] underline underline-offset-2" style={{ color: "#185fa5" }}>LinkedIn</a>
                        )}
                      </div>
                    )}

                    {/* Relationship dots */}
                    <RelationshipDots
                      score={contact.relationship_score}
                      onUpdate={(s) => void updateScore(contact.id, s)}
                    />

                    {/* Note — inline editable */}
                    {editingNote?.contactId === contact.id ? (
                      <textarea
                        autoFocus
                        value={editingNote.value}
                        onChange={(e) =>
                          setEditingNote({ contactId: contact.id, value: e.target.value })
                        }
                        onBlur={() => void saveNote()}
                        rows={2}
                        placeholder="Add a note about this person's style, process approach, or how to manage them..."
                        className="w-full mt-1 text-[12px] leading-[1.4] rounded-[6px] px-2 py-1 resize-none"
                        style={{
                          border: "0.5px solid rgba(26,26,24,0.20)",
                          background: "#fafaf9",
                          color: "#1a1a18",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <button
                        className="w-full text-left mt-1"
                        onClick={() =>
                          setEditingNote({ contactId: contact.id, value: contact.notes ?? "" })
                        }
                      >
                        {contact.notes ? (
                          <p
                            className="text-[12px] leading-[1.4]"
                            style={{ color: "#5f5e5a" }}
                          >
                            {contact.notes}
                          </p>
                        ) : (
                          <p
                            className="text-[12px] leading-[1.4]"
                            style={{ color: "#b8b7b2" }}
                          >
                            Add a note about this contact...
                          </p>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const DOT_LABELS: Record<number, string> = {
  1: "No real relationship yet",
  2: "Some contact, still thin",
  3: "Working relationship",
  4: "Solid — responsive and trusting",
  5: "Strong partner",
};

function dotStyle(dotIndex: number, score: number | null): React.CSSProperties {
  if (!score || dotIndex > score) return { background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" };
  return { background: score >= 4 ? "#185fa5" : "#b5d4f4" };
}

function RelationshipDots({
  score,
  onUpdate,
}: {
  score: number | null;
  onUpdate: (s: number) => void;
}) {
  const [open, setOpen] = useState(false);

  function handleSelect(s: number) {
    onUpdate(s);
    setOpen(false);
  }

  return (
    <>
      <button
        className="flex items-center gap-[3px] mt-1"
        onClick={() => setOpen(true)}
        title="Click to update relationship score"
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="block w-2 h-2 rounded-full"
            style={dotStyle(i, score)}
          />
        ))}
        <span className="ml-1.5 text-[11px]" style={{ color: "#888780" }}>
          {score ? DOT_LABELS[score] : "Rate relationship"}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ maxWidth: 320 }}>
          <DialogHeader>
            <DialogTitle>Relationship score</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-[6px] text-left transition-colors"
                style={{
                  background: score === i ? "#e6f1fb" : "#f5f5f3",
                  border: score === i ? "0.5px solid #b5d4f4" : "0.5px solid transparent",
                }}
              >
                <div className="flex items-center gap-[3px] shrink-0">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <span
                      key={d}
                      className="block w-2 h-2 rounded-full"
                      style={dotStyle(d, i)}
                    />
                  ))}
                </div>
                <span className="text-[12px]" style={{ color: "#1a1a18" }}>
                  {i} — {DOT_LABELS[i]}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── open requisitions card ───────────────────────────────────────────────────

function OpenRequisitionsCard({
  reqs,
  closedReqs,
  contacts,
  onAdd,
}: {
  reqs: ReqWithPipeline[];
  closedReqs: ReqWithPipeline[];
  contacts: Contact[];
  onAdd: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SL>Open jobs</SL>
          {reqs.length > 0 && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded -mt-2"
              style={{ background: "#eaf3de", color: "#27500a" }}
            >
              {reqs.length}
            </span>
          )}
        </div>
        <button className="ab" onClick={onAdd}>
          <IconPlus size={11} /> Add
        </button>
      </div>

      {reqs.length === 0 && (
        <p className="text-[13px]" style={{ color: "#888780" }}>
          No open jobs. Add one to start building the pipeline.
        </p>
      )}

      {reqs.map((r) => {
        const hm = contacts.find((c) => c.id === r.hiring_manager_id);
        const active = (r.processes ?? []).filter(
          (p) => !["Placed", "Closed lost"].includes(p.stage),
        );
        const atOffer = active.filter((p) => p.stage === "Offer");
        const inInterview = active.filter((p) => /^CCM\d+$/.test(p.stage));
        const cvsSent = active.filter((p) => !["Specs Sent", "Buy-In"].includes(p.stage));
        const buyIn = active.filter((p) => p.stage === "Buy-In");

        return (
          <div
            key={r.id}
            className="flex gap-3 py-3"
            style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}
          >
            {/* Left bar */}
            <div
              className="w-1 shrink-0 rounded-sm mt-[2px]"
              style={{ background: "#639922", alignSelf: "stretch", minHeight: 16 }}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium mb-0.5">{r.title}</p>
              <p className="text-[12px] mb-1.5" style={{ color: "#5f5e5a" }}>
                {[
                  r.salary_min || r.salary_max
                    ? `${formatYen(r.salary_min)}–${formatYen(r.salary_max)} base`
                    : null,
                  r.interview_rounds ? `${r.interview_rounds} rounds` : null,
                  hm ? `HM: ${hm.name}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {/* Pipeline badges */}
              <div className="flex items-center gap-1 flex-wrap">
                {inInterview.length > 0 && (
                  <PipelineBadge style={{ background: "#e6f1fb", color: "#185fa5" }}>
                    {inInterview.length} in interview
                  </PipelineBadge>
                )}
                {atOffer.length > 0 && (
                  <PipelineBadge style={{ background: "#fff3e0", color: "#633806", borderColor: "#ef9f27" }}>
                    {atOffer.length} at offer
                  </PipelineBadge>
                )}
                {cvsSent.length > 0 && inInterview.length === 0 && (
                  <PipelineBadge style={{ background: "#f5f5f3", color: "#888780" }}>
                    {cvsSent.length} CV sent
                  </PipelineBadge>
                )}
                {buyIn.length > 0 && (
                  <PipelineBadge style={{ background: "#faeeda", color: "#633806" }}>
                    {buyIn.length} buy-in secured
                  </PipelineBadge>
                )}
                {active.length === 0 && (
                  <PipelineBadge style={{ background: "#f5f5f3", color: "#888780" }}>
                    No pipeline
                  </PipelineBadge>
                )}
                <PipelineBadge
                  style={
                    r.is_backfill
                      ? { background: "#f5f5f3", color: "#888780" }
                      : { background: "#eaf3de", color: "#27500a" }
                  }
                >
                  {r.is_backfill ? "Backfill" : "Net-new"}
                </PipelineBadge>
              </div>
            </div>
          </div>
        );
      })}

      {/* Closed reqs */}
      {closedReqs.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid rgba(26,26,24,0.08)" }}>
          <p className="sl mb-2">Closed</p>
          {closedReqs.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 py-1.5 text-[12px]"
              style={{ color: "#888780" }}
            >
              <div className="w-1 h-4 rounded-sm shrink-0" style={{ background: "rgba(26,26,24,0.12)" }} />
              {r.title}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PipelineBadge({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="text-[11px] font-medium px-[7px] py-[2px] rounded"
      style={{ border: "0.5px solid rgba(26,26,24,0.12)", ...style }}
    >
      {children}
    </span>
  );
}


// ─── recommended actions panel ────────────────────────────────────────────────

const ACTION_STYLE: Record<
  ActionPriority,
  { bg: string; border: string; titleColor: string; bodyColor: string; btnBg: string; btnColor: string }
> = {
  urgent: {
    bg: "#fcebeb",
    border: "#a32d2d",
    titleColor: "#791f1f",
    bodyColor: "#a32d2d",
    btnBg: "#a32d2d",
    btnColor: "#fff",
  },
  warning: {
    bg: "#faeeda",
    border: "#ef9f27",
    titleColor: "#633806",
    bodyColor: "#854f0b",
    btnBg: "#633806",
    btnColor: "#fff",
  },
  info: {
    bg: "#e6f1fb",
    border: "#185fa5",
    titleColor: "#0c447c",
    bodyColor: "#185fa5",
    btnBg: "#185fa5",
    btnColor: "#fff",
  },
  nudge: {
    bg: "#eaf3de",
    border: "#639922",
    titleColor: "#27500a",
    bodyColor: "#3b6d11",
    btnBg: "#27500a",
    btnColor: "#fff",
  },
};

function RecommendedActionsPanel({
  actions,
  onLogCall,
  onCtaClick,
  draftLoading,
}: {
  actions: ActionItem[];
  onLogCall: () => void;
  onCtaClick: (item: ActionItem) => void;
  draftLoading: boolean;
}) {
  const NON_DRAFT_CTAS = new Set(["Source more ↗", "View req ↗"]);

  return (
    <Card>
      <SL>Recommended actions</SL>
      {actions.length === 0 ? (
        <p className="text-[13px]" style={{ color: "#888780" }}>
          No action items right now. Good work.
        </p>
      ) : (
        <div className="space-y-2">
          {actions.map((item) => {
            const s = ACTION_STYLE[item.priority];
            const isNonDraft = NON_DRAFT_CTAS.has(item.cta);
            return (
              <div
                key={item.id}
                className="rounded-[8px] p-[10px_12px]"
                style={{
                  background: s.bg,
                  borderLeft: `3px solid ${s.border}`,
                }}
              >
                <p className="text-[12px] font-medium mb-0.5" style={{ color: s.titleColor }}>
                  {item.title}
                </p>
                <p className="text-[12px] leading-snug mb-2" style={{ color: s.bodyColor }}>
                  {item.body}
                </p>
                <button
                  className="text-[11px] font-medium px-[9px] py-[4px] rounded flex items-center gap-1"
                  style={{
                    background: s.btnBg,
                    color: s.btnColor,
                    opacity: draftLoading && !isNonDraft ? 0.6 : 1,
                    cursor: draftLoading && !isNonDraft ? "default" : "pointer",
                  }}
                  disabled={draftLoading && !isNonDraft}
                  onClick={() => {
                    if (item.cta === "Log call") onLogCall();
                    else onCtaClick(item);
                  }}
                >
                  {!isNonDraft && <IconSparkles size={9} />}
                  {item.cta}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── quick actions card ───────────────────────────────────────────────────────

function QuickActionsCard({
  onLogReq,
  onLogEvent,
  onMeetingPrep,
  draftLoading,
}: {
  onLogReq: () => void;
  onLogEvent: (type: "call" | "email" | "meeting") => void;
  onMeetingPrep: () => void;
  draftLoading: boolean;
}) {
  const [showEventMenu, setShowEventMenu] = useState(false);

  const btnBase: React.CSSProperties = {
    border: "0.5px solid rgba(26,26,24,0.12)",
    background: "#fff",
  };

  return (
    <Card>
      <SL>Quick actions</SL>
      <div className="space-y-1.5">

        {/* Prep for client meeting */}
        <button
          onClick={onMeetingPrep}
          disabled={draftLoading}
          className="flex items-center gap-2 w-full text-left text-[13px] px-3 py-2 rounded-[6px]"
          style={{ ...btnBase, opacity: draftLoading ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!draftLoading) e.currentTarget.style.background = "#f5f5f3"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
        >
          <IconSparkles size={14} style={{ color: "#5f5e5a" }} />
          {draftLoading ? "Generating…" : "Prep for client meeting ↗"}
        </button>

        {/* Log new job */}
        <button
          onClick={onLogReq}
          className="flex items-center gap-2 w-full text-left text-[13px] px-3 py-2 rounded-[6px]"
          style={btnBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f3"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
        >
          <IconPlus size={14} style={{ color: "#5f5e5a" }} />
          Log new job
        </button>

        {/* Log event — dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowEventMenu((v) => !v)}
            className="flex items-center gap-2 w-full text-left text-[13px] px-3 py-2 rounded-[6px]"
            style={{ ...btnBase, background: showEventMenu ? "#f5f5f3" : "#fff" }}
          >
            <IconPhone size={14} style={{ color: "#5f5e5a" }} />
            Log event
            <span className="ml-auto text-[10px]" style={{ color: "#b8b7b2" }}>
              {showEventMenu ? "▴" : "▾"}
            </span>
          </button>

          {showEventMenu && (
            <div
              className="absolute left-0 right-0 top-full mt-1 rounded-[8px] overflow-hidden z-10"
              style={{
                border: "0.5px solid rgba(26,26,24,0.12)",
                background: "#fff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
            >
              {(["Call", "Email", "Meeting"] as const).map((label) => {
                const type = label.toLowerCase() as "call" | "email" | "meeting";
                return (
                  <button
                    key={type}
                    onClick={() => { setShowEventMenu(false); onLogEvent(type); }}
                    className="flex items-center gap-2 w-full text-left text-[13px] px-3 py-2"
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f3"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </Card>
  );
}

// ─── japan market context card ────────────────────────────────────────────────

function JapanMarketContextCard({ client: c }: { client: ClientRecord }) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: "Years in Japan",
      value: c.years_in_japan ? `${c.years_in_japan} years` : "—",
    },
    {
      label: "Employees in Japan",
      value: c.japan_team_size ? `~${c.japan_team_size.toLocaleString()}` : "—",
    },
    {
      label: "% Japanese nationals",
      value: c.japan_team_japanese_pct ? `~${c.japan_team_japanese_pct}%` : "—",
    },
    {
      label: "Japan role in group",
      value: c.japan_role_in_group ?? "—",
    },
    {
      label: "KK entity",
      value:
        c.kk_entity === "true" || c.kk_entity === "Yes" ? (
          <span style={{ color: "#27500a" }}>Yes</span>
        ) : c.kk_entity === "false" || c.kk_entity === "No" ? (
          <span style={{ color: "#a32d2d" }}>No</span>
        ) : c.kk_entity ? (
          <span style={{ color: "#27500a" }}>{c.kk_entity}</span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <Card>
      <SL>Japan market context</SL>
      <div className="space-y-2 mb-3">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="flex justify-between text-[12px] py-1"
            style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}
          >
            <span style={{ color: "#5f5e5a" }}>{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] leading-snug" style={{ color: "#888780" }}>
        Use these facts when pitching {c.company_name} to candidates from domestic firms who are concerned about moving.
      </p>
    </Card>
  );
}

// ─── add contact dialog ───────────────────────────────────────────────────────

function AddContactDialog({
  clientId,
  recruiterId,
  open,
  onClose,
}: {
  clientId: string;
  recruiterId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    role: "" as ContactRole | "",
    title: "",
    email: "",
    phone: "",
    linkedin_url: "",
    notes: "",
    is_primary: false,
    bypass_hr_warning: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_contacts").insert({
        client_id: clientId,
        recruiter_id: recruiterId,
        name: form.name.trim(),
        role: form.role,
        title: form.title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        notes: form.notes.trim() || null,
        is_primary: form.is_primary,
        bypass_hr_warning: form.bypass_hr_warning,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Contact added");
      setForm({ name: "", role: "", title: "", email: "", phone: "", linkedin_url: "", notes: "", is_primary: false, bypass_hr_warning: false });
      onClose();
    },
    onError: () => toast.error("Failed to add contact"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <F label="Name *">
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Yamada Hanako" autoFocus />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Role *">
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v as ContactRole }))}>
                <SelectTrigger><SelectValue placeholder="Select role…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hiring_manager">Hiring manager</SelectItem>
                  <SelectItem value="hr_gatekeeper">HR gatekeeper</SelectItem>
                  <SelectItem value="ta_coordinator">TA coordinator</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="Title">
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="VP Engineering" />
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Email">
              <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="hanako@company.com" type="email" />
            </F>
            <F label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+81 3 0000 0000" />
            </F>
          </div>
          <F label="LinkedIn URL">
            <Input value={form.linkedin_url} onChange={(e) => setForm((p) => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/…" />
          </F>
          <F label="Notes (recruiter observation — AI never writes here)">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Communication style, preferences, how to manage them…"
              className="min-h-[70px]"
            />
          </F>
          <div className="flex items-center gap-4 text-[13px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm((p) => ({ ...p, is_primary: e.target.checked }))}
              />
              Primary contact
            </label>
            {form.role === "hr_gatekeeper" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.bypass_hr_warning}
                  onChange={(e) => setForm((p) => ({ ...p, bypass_hr_warning: e.target.checked }))}
                />
                Show bypass warning
              </label>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || !form.role || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── requisition intake modal ─────────────────────────────────────────────────

type InterviewRound = { interviewer: string; focus: string };

const EMPTY_REQ = {
  title: "",
  is_backfill: false,
  why_role_opened: "",
  strategic_context: "",
  salary_min: "",
  salary_max: "",
  salary_stretch: "",
  urgency: "normal",
  ideal_candidate_notes: "",
  age_min: "",
  age_max: "",
  japanese_level_required: "",
  english_level_required: "",
  industry_must_haves: "",
  flexibility_notes: "",
  interview_rounds: "",
  interview_structure: [] as InterviewRound[],
  has_skills_test: false,
  skills_test_notes: "",
  hm_can_meet_in_person: "" as "" | "true" | "false",
  hm_communication_style: "",
  hm_rejection_patterns: "",
  hm_priority_beyond_jd: "",
  other_agencies: "" as "" | "true" | "false",
  other_agency_names: "",
  open_to_foreign_candidates: "" as "" | "true" | "false",
  internal_candidate: "" as "" | "true" | "false",
  target_start_date: "",
};

function triState(v: "" | "true" | "false"): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function TriSelect({
  value,
  onChange,
}: {
  value: "" | "true" | "false";
  onChange: (v: "" | "true" | "false") => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as "" | "true" | "false")}>
      <SelectTrigger>
        <SelectValue placeholder="Unknown" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">Unknown</SelectItem>
        <SelectItem value="true">Yes</SelectItem>
        <SelectItem value="false">No</SelectItem>
      </SelectContent>
    </Select>
  );
}

function IntakeSectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <span
        className="text-[11px] font-medium uppercase shrink-0"
        style={{ color: "#5f5e5a", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: "0.5px", background: "rgba(26,26,24,0.12)" }} />
    </div>
  );
}

function RequisitionIntakeModal({
  clientId,
  recruiterId,
  open,
  onClose,
}: {
  clientId: string;
  recruiterId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_REQ);
  const [generatingContext, setGeneratingContext] = useState(false);
  const [jdUploading, setJdUploading] = useState(false);
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [extractingConditions, setExtractingConditions] = useState(false);
  const [suggestedConditions, setSuggestedConditions] = useState<Array<{ condition_text: string; condition_type: string; source: string; priority_rank: number }>>([]);
  const jdInputRef = useRef<HTMLInputElement>(null);

  async function handleJdFile(file: File) {
    setJdUploading(true);
    try {
      // Extract text client-side for PDF using mammoth for docx, or send as-is
      let extractedText = "";
      if (file.name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        extractedText = result.value;
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const buf = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const resp = await fetch("/api/extract-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: base64 }),
        });
        const data = (await resp.json()) as { text?: string; error?: string };
        extractedText = data.text?.trim() ?? `[PDF: ${file.name}]`;
      }
      // Upload to storage
      const path = `${recruiterId}/${clientId}/jd_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("resumes").upload(path, file);
      if (!error) setJdUrl(path);
      setJdText(extractedText);
      if (extractedText.length > 50 && !extractedText.startsWith("[PDF")) {
        void extractConditions(extractedText);
      }
      toast.success("JD uploaded.");
    } catch { toast.error("JD upload failed."); }
    finally { setJdUploading(false); }
  }

  async function extractConditions(text: string) {
    setExtractingConditions(true);
    try {
      const resp = await fetch("/api/ai/extract-conditions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisition_id: "preview", jd_text: text }),
      });
      const data = (await resp.json()) as { conditions?: typeof suggestedConditions };
      if (data.conditions) setSuggestedConditions(data.conditions);
    } catch { /* silent */ }
    finally { setExtractingConditions(false); }
  }

  function wan(v: string): number | null {
    const n = parseInt(v);
    return isNaN(n) ? null : n * 10_000;
  }

  function handleRoundsChange(v: string) {
    const n = Math.min(Math.max(parseInt(v) || 0, 0), 10);
    setForm((p) => ({
      ...p,
      interview_rounds: v,
      interview_structure: Array.from({ length: n }, (_, i) =>
        p.interview_structure[i] ?? { interviewer: "", focus: "" },
      ),
    }));
  }

  function updateRound(index: number, field: keyof InterviewRound, value: string) {
    setForm((p) => {
      const updated = [...p.interview_structure];
      updated[index] = { ...updated[index], [field]: value };
      return { ...p, interview_structure: updated };
    });
  }

  async function generateStrategicContext() {
    if (!form.title.trim()) {
      toast.error("Enter a role title first");
      return;
    }
    setGeneratingContext(true);
    try {
      const resp = await fetch("/api/ai/req-strategic-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: form.title.trim(),
          whyRoleOpened: form.why_role_opened.trim(),
          isBackfill: form.is_backfill,
        }),
      });
      const json = (await resp.json()) as { content?: string };
      if (json.content) {
        setForm((p) => ({ ...p, strategic_context: json.content! }));
        toast.success("Draft generated — review and edit before saving");
      }
    } catch {
      toast.error("Failed to generate draft");
    } finally {
      setGeneratingContext(false);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const structurePayload =
        form.interview_structure.length > 0
          ? form.interview_structure.map((r, i) => ({
              round: i + 1,
              interviewer: r.interviewer.trim(),
              focus: r.focus.trim(),
            }))
          : null;

      const { data: insertedReq, error } = await supabase.from("requisitions").insert({
        client_id: clientId,
        recruiter_id: recruiterId,
        is_open: true,
        title: form.title.trim(),
        is_backfill: form.is_backfill,
        why_role_opened: form.why_role_opened.trim() || null,
        strategic_context: form.strategic_context.trim() || null,
        salary_min: wan(form.salary_min),
        salary_max: wan(form.salary_max),
        salary_stretch: wan(form.salary_stretch),
        urgency: form.urgency || null,
        jd_url: jdUrl || null,
        jd_text: jdText || null,
        ideal_candidate_notes: form.ideal_candidate_notes.trim() || null,
        age_min: form.age_min ? parseInt(form.age_min) : null,
        age_max: form.age_max ? parseInt(form.age_max) : null,
        japanese_level_required: form.japanese_level_required || null,
        english_level_required: form.english_level_required || null,
        industry_must_haves: form.industry_must_haves.trim() || null,
        flexibility_notes: form.flexibility_notes.trim() || null,
        interview_rounds: form.interview_rounds ? parseInt(form.interview_rounds) : null,
        interview_structure: structurePayload,
        has_skills_test: form.has_skills_test,
        skills_test_notes: form.skills_test_notes.trim() || null,
        hm_can_meet_in_person: triState(form.hm_can_meet_in_person),
        hm_communication_style: form.hm_communication_style.trim() || null,
        hm_rejection_patterns: form.hm_rejection_patterns.trim() || null,
        hm_priority_beyond_jd: form.hm_priority_beyond_jd.trim() || null,
        other_agencies: triState(form.other_agencies),
        other_agency_names: form.other_agency_names.trim() || null,
        open_to_foreign_candidates: triState(form.open_to_foreign_candidates),
        internal_candidate: triState(form.internal_candidate),
        target_start_date: form.target_start_date || null,
      }).select("id").single();
      if (error) throw error;

      // Save extracted conditions
      if (insertedReq && suggestedConditions.length > 0) {
        const condRows = suggestedConditions
          .filter((c) => c.condition_text.trim())
          .map((c) => ({
            requisition_id: insertedReq.id,
            recruiter_id: recruiterId,
            condition_text: c.condition_text.trim(),
            condition_type: c.condition_type,
            source: c.source,
            priority_rank: c.priority_rank,
          }));
        if (condRows.length > 0) {
          await supabase.from("requisition_conditions").insert(condRows);
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Job saved");
      setForm(EMPTY_REQ);
      onClose();
    },
    onError: () => toast.error("Failed to save requisition"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ maxWidth: 680 }}>
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[72vh] pr-2 space-y-5 py-1">

          {/* ── A — Role basics ── */}
          <div>
            <IntakeSectionHeader label="A — Role basics" />
            <div className="space-y-3">
              <F label="Job title *">
                <Input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. VP of Engineering"
                />
              </F>

              <div className="grid grid-cols-2 gap-3">
                <F label="Urgency">
                  <Select
                    value={form.urgency}
                    onValueChange={(v) => setForm((p) => ({ ...p, urgency: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical — fill immediately</SelectItem>
                      <SelectItem value="high">High — within 4 weeks</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low — nice to have</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_backfill}
                      onChange={(e) => setForm((p) => ({ ...p, is_backfill: e.target.checked }))}
                    />
                    Backfill role
                  </label>
                </div>
              </div>

              <F
                label={
                  form.is_backfill
                    ? "What happened to the previous person? (sensitive — internal only)"
                    : "Why does this role exist?"
                }
              >
                <Textarea
                  value={form.why_role_opened}
                  onChange={(e) => setForm((p) => ({ ...p, why_role_opened: e.target.value }))}
                  placeholder={
                    form.is_backfill
                      ? "Resigned, performance managed out…"
                      : "New team build-out, expansion into new product area…"
                  }
                  className="min-h-[60px]"
                />
              </F>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs">Strategic context</Label>
                  <button
                    type="button"
                    className="ab flex items-center gap-1"
                    onClick={() => void generateStrategicContext()}
                    disabled={generatingContext}
                  >
                    <IconSparkles size={10} />
                    {generatingContext ? "Generating…" : "Generate draft ↗"}
                  </button>
                </div>
                <Textarea
                  value={form.strategic_context}
                  onChange={(e) => setForm((p) => ({ ...p, strategic_context: e.target.value }))}
                  placeholder="Why this role matters to the business right now — recruiter uses this to pitch the opportunity"
                  className="min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <F label="Salary min (万円)">
                  <Input
                    type="number"
                    value={form.salary_min}
                    onChange={(e) => setForm((p) => ({ ...p, salary_min: e.target.value }))}
                    placeholder="800"
                  />
                </F>
                <F label="Salary max (万円)">
                  <Input
                    type="number"
                    value={form.salary_max}
                    onChange={(e) => setForm((p) => ({ ...p, salary_max: e.target.value }))}
                    placeholder="1200"
                  />
                </F>
                <F label="Stretch (万円)">
                  <Input
                    type="number"
                    value={form.salary_stretch}
                    onChange={(e) => setForm((p) => ({ ...p, salary_stretch: e.target.value }))}
                    placeholder="1400"
                  />
                </F>
              </div>
            </div>
          </div>

          {/* ── JD Upload ── */}
          <div>
            <IntakeSectionHeader label="Job description (PDF or DOCX)" />
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer"
              style={{ background: jdText ? "#f0fae8" : "#f5f5f3", border: `0.5px dashed ${jdText ? "rgba(39,80,10,0.3)" : "rgba(26,26,24,0.2)"}` }}
              onClick={() => !jdUploading && jdInputRef.current?.click()}
            >
              <IconFileText size={16} style={{ color: "#888780", flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px]" style={{ color: "#5f5e5a" }}>
                  {jdUploading ? "Uploading…" : jdText ? "JD uploaded — conditions extracted below" : "Upload JD (PDF or DOCX) — conditions will be extracted automatically"}
                </p>
              </div>
              {extractingConditions && <span className="text-[11px]" style={{ color: "#185fa5" }}>Extracting conditions…</span>}
              {jdText && !extractingConditions && <span className="text-[11px]" style={{ color: "#27500a" }}>✓ Done</span>}
              <input ref={jdInputRef} type="file" accept=".pdf,.docx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleJdFile(f); e.target.value = ""; }} />
            </div>
            {suggestedConditions.length > 0 && (
              <div className="mt-3 rounded-[8px] p-3 space-y-2" style={{ background: "#f5f5f3" }}>
                <p className="sl mb-2">Extracted conditions — edit before saving</p>
                {suggestedConditions.map((cond, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                      style={{ background: cond.condition_type === "must_have" ? "#fdf3e7" : "#f5f5f3", color: cond.condition_type === "must_have" ? "#633806" : "#888780" }}
                    >
                      {cond.condition_type === "must_have" ? "Must" : "Nice"}
                    </span>
                    <input
                      className="flex-1 text-[12px] bg-transparent border-b outline-none"
                      style={{ borderColor: "rgba(26,26,24,0.12)", color: "#1a1a18" }}
                      value={cond.condition_text}
                      onChange={(e) => setSuggestedConditions((prev) => prev.map((c, j) => j === i ? { ...c, condition_text: e.target.value } : c))}
                    />
                    <button onClick={() => setSuggestedConditions((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[11px] shrink-0" style={{ color: "#b8b7b2" }}>✕</button>
                  </div>
                ))}
                <button
                  className="ab mt-1"
                  onClick={() => setSuggestedConditions((prev) => [...prev, { condition_text: "", condition_type: "must_have", source: "client", priority_rank: prev.length + 1 }])}
                >
                  + Add condition
                </button>
              </div>
            )}
          </div>

          {/* ── B — Ideal candidate ── */}
          <div>
            <IntakeSectionHeader label="B — Ideal candidate profile" />
            <div className="space-y-3">
              <F label="What does the ideal candidate look like?">
                <Textarea
                  value={form.ideal_candidate_notes}
                  onChange={(e) => setForm((p) => ({ ...p, ideal_candidate_notes: e.target.value }))}
                  placeholder="Background, experience level, must-have skills and profile…"
                  className="min-h-[70px]"
                />
              </F>

              <div className="grid grid-cols-4 gap-3">
                <F label="Age min">
                  <Input
                    type="number"
                    value={form.age_min}
                    onChange={(e) => setForm((p) => ({ ...p, age_min: e.target.value }))}
                    placeholder="28"
                  />
                </F>
                <F label="Age max">
                  <Input
                    type="number"
                    value={form.age_max}
                    onChange={(e) => setForm((p) => ({ ...p, age_max: e.target.value }))}
                    placeholder="45"
                  />
                </F>
                <F label="Japanese level">
                  <Select
                    value={form.japanese_level_required}
                    onValueChange={(v) => setForm((p) => ({ ...p, japanese_level_required: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      <SelectItem value="Native">Native</SelectItem>
                      <SelectItem value="Business">Business (N2)</SelectItem>
                      <SelectItem value="Conversational">Conversational (N3+)</SelectItem>
                      <SelectItem value="Basic">Basic (N4+)</SelectItem>
                      <SelectItem value="Not required">Not required</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
                <F label="English level">
                  <Select
                    value={form.english_level_required}
                    onValueChange={(v) => setForm((p) => ({ ...p, english_level_required: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      <SelectItem value="Native">Native</SelectItem>
                      <SelectItem value="Business fluent">Business fluent</SelectItem>
                      <SelectItem value="Conversational">Conversational</SelectItem>
                      <SelectItem value="Basic">Basic</SelectItem>
                      <SelectItem value="Not required">Not required</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>

              <F label="Industry / background must-haves">
                <Textarea
                  value={form.industry_must_haves}
                  onChange={(e) => setForm((p) => ({ ...p, industry_must_haves: e.target.value }))}
                  placeholder="SaaS, financial services, enterprise software…"
                  className="min-h-[50px]"
                />
              </F>

              <F label="Where can they be flexible? (critical for expectation management)">
                <Textarea
                  value={form.flexibility_notes}
                  onChange={(e) => setForm((p) => ({ ...p, flexibility_notes: e.target.value }))}
                  placeholder="Industry cross-over OK, start-up experience not required…"
                  className="min-h-[50px]"
                />
              </F>
            </div>
          </div>

          {/* ── C — Interview process ── */}
          <div>
            <IntakeSectionHeader label="C — Interview process" />
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <F label="Number of rounds">
                  <Input
                    type="number"
                    value={form.interview_rounds}
                    onChange={(e) => handleRoundsChange(e.target.value)}
                    placeholder="4"
                    min={0}
                    max={10}
                  />
                </F>
                <F label="Recruiter can meet HM in person?">
                  <TriSelect
                    value={form.hm_can_meet_in_person}
                    onChange={(v) => setForm((p) => ({ ...p, hm_can_meet_in_person: v }))}
                  />
                </F>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.has_skills_test}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, has_skills_test: e.target.checked }))
                      }
                    />
                    Skills / technical test
                  </label>
                </div>
              </div>

              {form.has_skills_test && (
                <F label="Test description">
                  <Textarea
                    value={form.skills_test_notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, skills_test_notes: e.target.value }))
                    }
                    placeholder="Case study, coding test, presentation…"
                    className="min-h-[50px]"
                  />
                </F>
              )}

              {form.interview_structure.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Round-by-round structure</Label>
                  {form.interview_structure.map((round, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <Input
                        value={round.interviewer}
                        onChange={(e) => updateRound(i, "interviewer", e.target.value)}
                        placeholder={`Round ${i + 1} — who they meet`}
                      />
                      <Input
                        value={round.focus}
                        onChange={(e) => updateRound(i, "focus", e.target.value)}
                        placeholder="What they're assessing"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── D — HM intelligence ── */}
          <div>
            <IntakeSectionHeader label="D — Hiring manager intelligence" />
            <div className="space-y-3">
              <F label="HM communication style (recruiter observation)">
                <Textarea
                  value={form.hm_communication_style}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, hm_communication_style: e.target.value }))
                  }
                  placeholder="Direct and data-driven, prefers written updates, needs time to warm up to candidates…"
                  className="min-h-[60px]"
                />
              </F>
              <F label="Profiles this HM has historically rejected">
                <Textarea
                  value={form.hm_rejection_patterns}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, hm_rejection_patterns: e.target.value }))
                  }
                  placeholder="Over-qualified, purely technical with no leadership experience, candidates who job-hop…"
                  className="min-h-[60px]"
                />
              </F>
              <F label="What matters most to this HM beyond the JD?">
                <Textarea
                  value={form.hm_priority_beyond_jd}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, hm_priority_beyond_jd: e.target.value }))
                  }
                  placeholder="Culture add, startup mindset, someone who can build a team from scratch…"
                  className="min-h-[60px]"
                />
              </F>
            </div>
          </div>

          {/* ── E — Competition and signals ── */}
          <div>
            <IntakeSectionHeader label="E — Competition and urgency signals" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <F label="Other agencies working this role?">
                  <TriSelect
                    value={form.other_agencies}
                    onChange={(v) => setForm((p) => ({ ...p, other_agencies: v }))}
                  />
                </F>
                <F label="Open to foreign candidates?">
                  <TriSelect
                    value={form.open_to_foreign_candidates}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, open_to_foreign_candidates: v }))
                    }
                  />
                </F>
              </div>

              {form.other_agencies === "true" && (
                <F label="Other agency names (if known)">
                  <Input
                    value={form.other_agency_names}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, other_agency_names: e.target.value }))
                    }
                    placeholder="Robert Walters, Michael Page…"
                  />
                </F>
              )}

              <div className="grid grid-cols-2 gap-3">
                <F label="Internal candidate being considered?">
                  <TriSelect
                    value={form.internal_candidate}
                    onChange={(v) => setForm((p) => ({ ...p, internal_candidate: v }))}
                  />
                </F>
                <F label="Target start date">
                  <Input
                    type="date"
                    value={form.target_start_date}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, target_start_date: e.target.value }))
                    }
                  />
                </F>
              </div>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!form.title.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── log interaction dialog ───────────────────────────────────────────────────

function LogInteractionDialog({
  clientId,
  recruiterId,
  open,
  onClose,
  initialType = "call",
}: {
  clientId: string;
  recruiterId: string;
  open: boolean;
  onClose: () => void;
  initialType?: string;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState(initialType);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) setType(initialType);
  }, [open, initialType]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("interactions").insert({
        client_id: clientId,
        recruiter_id: recruiterId,
        interaction_type: type as "call" | "email" | "meeting" | "note",
        summary: summary.trim() || null,
        full_notes: notes.trim() || null,
        interacted_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Interaction logged");
      setType("call");
      setSummary("");
      setNotes("");
      onClose();
    },
    onError: () => toast.error("Failed to log interaction"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <F label="Type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Summary (1 line — shown in activity feed)">
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Call with Yamada — discussed VP Eng req, 4 rounds confirmed" autoFocus />
          </F>
          <F label="Full notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key points discussed, agreements made, follow-ups outstanding…" className="min-h-[80px]" />
          </F>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={(!summary.trim() && !notes.trim()) || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── draft modal ─────────────────────────────────────────────────────────────

function DraftModal({
  draft,
  onClose,
}: {
  draft: { title: string; content: string } | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState("");
  const [copied, setCopied] = useState(false);

  // Sync edited value when draft changes
  if (draft && edited === "" && !editing) {
    // initialise lazily on first open
  }

  function handleOpen() {
    setEditing(false);
    setEdited(draft?.content ?? "");
    setCopied(false);
  }

  function copy() {
    void navigator.clipboard.writeText(editing ? edited : (draft?.content ?? ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayContent = editing ? edited : (draft?.content ?? "");

  return (
    <Dialog
      open={!!draft}
      onOpenChange={(v) => {
        if (!v) { onClose(); setEditing(false); setEdited(""); }
        else handleOpen();
      }}
    >
      <DialogContent style={{ maxWidth: 620 }}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="capitalize">{draft?.title ?? ""}</DialogTitle>
            <div className="flex items-center gap-1.5 mr-6">
              <button
                className="ab flex items-center gap-1"
                onClick={() => {
                  if (!editing) setEdited(draft?.content ?? "");
                  setEditing((v) => !v);
                }}
              >
                <IconEdit size={11} />
                {editing ? "Preview" : "Edit"}
              </button>
              <button
                className="ab flex items-center gap-1"
                onClick={copy}
              >
                {copied ? <IconCheck size={11} style={{ color: "#27500a" }} /> : <IconCopy size={11} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-1" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {editing ? (
            <textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              className="w-full rounded-[8px] p-3 text-[13px] leading-relaxed resize-none"
              style={{
                border: "0.5px solid rgba(26,26,24,0.20)",
                background: "#fafaf9",
                minHeight: 320,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          ) : (
            <div
              className="text-[13px] leading-relaxed rounded-[8px] p-3"
              style={{
                background: "#f5f5f3",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {displayContent}
            </div>
          )}
        </div>

        <p className="text-[11px] mt-2" style={{ color: "#888780" }}>
          AI-generated draft — review and edit before sending. Never send automatically.
        </p>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onClose(); setEditing(false); setEdited(""); }}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── shared form field ────────────────────────────────────────────────────────

function F({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ─── client enrich card (Tavily-powered) ─────────────────────────────────────

type TavilyEnrichResult = {
  japanTeamSize?: string;
  japanTeamSizeInt?: number;
  yearsInJapan?: number;
  employeeJapanesePct?: number;
  japanRoleInGroup?: string;
  strategicPriorities?: string;
  recentInitiatives?: string;
  sourceUrls?: string[];
};

function ClientEnrichCard({ clientId, companyName }: { clientId: string; companyName: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TavilyEnrichResult | null>(null);
  const [applying, setApplying] = useState(false);

  async function enrich() {
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch("/api/ai/enrich-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, company_name: companyName, url: url.trim() || undefined }),
      });
      const data = (await resp.json()) as { enrichment?: TavilyEnrichResult; error?: string };
      if (data.error) { toast.error(data.error); return; }
      if (data.enrichment) setResult(data.enrichment);
    } catch {
      toast.error("Enrichment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    try {
      type ClientPatch = { japan_role_in_group?: string; japan_team_size?: number; employee_japanese_pct?: number; years_in_japan?: number; strategy_notes?: string };
      const patch: ClientPatch = {};
      if (result.japanRoleInGroup)       patch.japan_role_in_group = result.japanRoleInGroup;
      if (result.japanTeamSizeInt != null) patch.japan_team_size = result.japanTeamSizeInt;
      if (result.employeeJapanesePct != null) patch.employee_japanese_pct = result.employeeJapanesePct;
      if (result.yearsInJapan != null)   patch.years_in_japan = result.yearsInJapan;
      if (result.strategicPriorities)    patch.strategy_notes = [result.strategicPriorities, result.recentInitiatives].filter(Boolean).join("\n\n");
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("clients").update(patch).eq("id", clientId);
        if (error) throw error;
      }
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Company profile updated from enrichment.");
      setResult(null);
      setExpanded(false);
    } catch {
      toast.error("Failed to apply enrichment.");
    } finally {
      setApplying(false);
    }
  }

  const previewRows: Array<{ label: string; value: string | null }> = result ? [
    { label: "Japan role in group",   value: result.japanRoleInGroup ?? null },
    { label: "Team size in Japan",    value: result.japanTeamSize ?? null },
    { label: "% Japanese staff",      value: result.employeeJapanesePct != null ? `${result.employeeJapanesePct}%` : null },
    { label: "Years in Japan",        value: result.yearsInJapan != null ? `${result.yearsInJapan} years` : null },
    { label: "Strategic priorities",  value: result.strategicPriorities ?? null },
    { label: "Recent initiatives",    value: result.recentInitiatives ?? null },
  ] : [];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}>
      <button className="w-full flex items-center gap-2 px-4 py-3 text-left" onClick={() => setExpanded((v) => !v)}>
        <IconSparkles size={13} style={{ color: "#888780" }} />
        <span className="flex-1 text-[12px]" style={{ color: "#5f5e5a" }}>Enrich company profile with web search</span>
        <span className="text-[11px]" style={{ color: "#b8b7b2" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-[11px] mb-2" style={{ color: "#888780" }}>
            Search uses <strong>{companyName}</strong> as the company name. Add the company URL for more accurate results.
          </p>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Company website URL (optional)"
            className="mb-2 text-xs h-8"
          />
          <button className="ab" onClick={() => void enrich()} disabled={loading}>
            <IconSparkles size={11} />
            {loading ? "Searching…" : "Search and enrich"}
          </button>
          {result && (
            <div className="mt-3 rounded-[8px] p-3" style={{ background: "#f5f5f3" }}>
              <p className="sl mb-2">Enrichment results — review before applying</p>
              <div className="space-y-1.5 mb-3">
                {previewRows.filter((r) => r.value != null).map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <span className="text-[11px]" style={{ color: "#888780" }}>{label}</span>
                    <span className="text-[12px] font-medium text-right" style={{ maxWidth: 240, color: "#1a1a18" }}>{value}</span>
                  </div>
                ))}
                {previewRows.every((r) => r.value == null) && (
                  <p className="text-[12px]" style={{ color: "#888780" }}>No data found. Try adding the company URL.</p>
                )}
              </div>
              {result.sourceUrls && result.sourceUrls.length > 0 && (
                <p className="text-[11px] mb-3" style={{ color: "#b8b7b2" }}>
                  Sources: {result.sourceUrls.slice(0, 3).map((u) => new URL(u).hostname).join(", ")}
                </p>
              )}
              <div className="flex gap-2">
                <button className="ab" onClick={() => void apply()} disabled={applying}>{applying ? "Applying…" : "Apply to profile"}</button>
                <button className="text-[11px]" style={{ color: "#888780" }} onClick={() => setResult(null)}>Discard</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── client timeline tab ──────────────────────────────────────────────────────

const INTERACTION_ICON: Record<string, React.ElementType> = {
  call: IconPhone,
  email: IconMail,
  meeting: IconCalendar,
};

const INTERACTION_COLORS: Record<string, { bg: string; color: string }> = {
  call:    { bg: "#e6f1fb", color: "#185fa5" },
  email:   { bg: "#f5f5f3", color: "#5f5e5a" },
  meeting: { bg: "#eaf3de", color: "#3b6d11" },
};

function formatInteractionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ClientTimelineTab({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return (
      <div
        className="rounded-xl px-5 py-12 text-center"
        style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <p className="text-[13px] font-medium" style={{ color: "#1a1a18" }}>No interactions logged yet.</p>
        <p className="text-[12px] mt-1" style={{ color: "#888780" }}>
          Use "Log event" to record calls, emails, and meetings with this client.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {interactions.map((item) => {
        const type = item.interaction_type ?? "call";
        const Icon = INTERACTION_ICON[type] ?? IconPhone;
        const colors = INTERACTION_COLORS[type] ?? INTERACTION_COLORS.call;
        return (
          <div
            key={item.id}
            className="rounded-xl p-[14px_18px]"
            style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                style={{ background: colors.bg }}
              >
                <Icon size={14} style={{ color: colors.color }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[11px] font-medium capitalize px-[6px] py-[2px] rounded"
                    style={{ background: colors.bg, color: colors.color }}
                  >
                    {type}
                  </span>
                  <span className="text-[11px]" style={{ color: "#b8b7b2" }}>
                    {formatInteractionDate(item.interacted_at)}
                  </span>
                </div>

                {item.summary && (
                  <p className="text-[13px] font-medium mb-0.5">{item.summary}</p>
                )}
                {item.full_notes && (
                  <p className="text-[12px] leading-relaxed" style={{ color: "#5f5e5a" }}>
                    {item.full_notes}
                  </p>
                )}
                {!item.summary && !item.full_notes && (
                  <p className="text-[12px]" style={{ color: "#b8b7b2" }}>No notes recorded.</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── client contract tab ──────────────────────────────────────────────────────

function ClientContractTab({ client: c }: { client: ClientRecord }) {
  const fields: Array<{ label: string; value: string | null }> = [
    { label: "Fee %",          value: c.fee_pct != null ? `${c.fee_pct}%` : null },
    { label: "Client since",   value: c.started_at ? new Date(c.started_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null },
    { label: "KK entity",      value: c.kk_entity ?? null },
    { label: "Account status", value: c.is_active ? "Active" : "Inactive" },
  ];

  return (
    <div
      className="rounded-xl p-[18px_20px]"
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <p className="sl mb-4">Contract details</p>
      <div className="space-y-3">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <span className="text-[12px]" style={{ color: "#888780" }}>{label}</span>
            <span className="text-[13px] font-medium" style={{ color: value ? "#1a1a18" : "#b8b7b2" }}>
              {value ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── client intelligence card ─────────────────────────────────────────────────

function ClientIntelligenceCard({
  clientId,
  aiContext,
  aiContextUpdatedAt,
}: {
  clientId: string;
  aiContext: string | null;
  aiContextUpdatedAt: string | null;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(!!aiContext);
  const [refreshing, setRefreshing] = useState(false);

  const relTime = (iso: string | null) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h} hour${h !== 1 ? "s" : ""} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d !== 1 ? "s" : ""} ago`;
  };

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/ai/refresh-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "client", entity_id: clientId }),
      });
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Account intelligence refreshed.");
    } catch { toast.error("Refresh failed. Try again."); }
    finally { setRefreshing(false); }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}>
      <button className="w-full flex items-center gap-2 px-4 py-3 text-left" onClick={() => setExpanded((v) => !v)}>
        <IconSparkles size={13} style={{ color: "#888780" }} />
        <span className="flex-1 text-[12px] font-medium" style={{ color: "#5f5e5a" }}>Account intelligence</span>
        {aiContextUpdatedAt && (
          <span className="text-[11px]" style={{ color: "#b8b7b2" }}>Updated {relTime(aiContextUpdatedAt)}</span>
        )}
        <span className="text-[11px]" style={{ color: "#b8b7b2" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {aiContext ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap mb-3" style={{ color: "#1a1a18" }}>{aiContext}</p>
          ) : (
            <p className="text-[13px] mb-3" style={{ color: "#888780" }}>
              No intelligence summary yet. Click refresh to generate one from the account history.
            </p>
          )}
          <button className="ab" onClick={() => void refresh()} disabled={refreshing}>
            <IconSparkles size={11} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}
