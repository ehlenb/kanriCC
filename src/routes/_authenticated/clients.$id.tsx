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
  IconUpload,
  IconBriefcase,
  IconX,
  IconSearch,
  IconMessageCircle,
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
  salary_range_text: string | null;
  location: string | null;
  urgency_date: string | null;
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
  contact_id: string | null;
  primary_party: string | null;
  candidates: { id: string; full_name: string } | null;
  client_contacts: { id: string; name: string } | null;
};

// ─── job-spec match types ─────────────────────────────────────────────────────

type AiMatchResult = {
  candidate_id: string;
  score: number;
  reason: string;
  is_salary_stretch: boolean;
  meets_must_haves: boolean;
  close_on_must_haves: boolean;
};

type MatchCandidate = AiMatchResult & {
  full_name: string;
  current_title: string | null;
  current_company: string | null;
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
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const [
        { data: client, error },
        { data: contacts },
        { data: reqs },
        { data: interactions },
      ] = await Promise.all([
        supabase
          .from("clients")
          .select(
            "id, company_name, logo_url, is_active, status, fee_pct, started_at, years_in_japan, japan_team_size, japan_team_japanese_pct, employee_japanese_pct, japan_role_in_group, kk_entity, strategy_notes, contract_signed, contract_url, ai_context, ai_context_updated_at",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("client_contacts")
          .select("id, name, role, title, notes, email, phone, linkedin_url, relationship_score, bypass_hr_warning, is_primary")
          .eq("client_id", id)
          .order("created_at"),
        supabase
          .from("requisitions")
          .select(
            `id, title, salary_min, salary_max, salary_stretch, salary_range_text, location, urgency_date, is_open, is_backfill,
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
          .select(
            "id, interaction_type, summary, full_notes, interacted_at, candidate_id, contact_id, primary_party, candidates(id, full_name), client_contacts(id, name)",
          )
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

  const [clientTab, setClientTab] = useState<"timeline" | "info" | "contacts" | "jobs" | "contract">("timeline");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [logInteractionOpen, setLogInteractionOpen] = useState(false);
  const [logForContactId, setLogForContactId] = useState<string | null>(null);
  const [logForContactName, setLogForContactName] = useState<string | null>(null);
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
      <div style={{ background: "var(--color-ink-10)", minHeight: "100vh" }}>
        <div className="h-12 bg-[--color-white]" style={{ borderBottom: "0.5px solid var(--color-ink-15)" }} />
        <div className="px-6 pt-5 space-y-3 max-w-4xl">
          <Skeleton className="h-32 w-full " />
          <Skeleton className="h-48 w-full " />
        </div>
      </div>
    );
  }

  if (!data?.client) {
    return (
      <div style={{ background: "var(--color-ink-10)", minHeight: "100vh" }} className="p-8 text-sm" >
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
    <div style={{ background: "var(--color-ink-10)", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        className="flex items-center gap-2 h-12 px-6 text-[13px]"
        style={{ background: "var(--color-white)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <button
          onClick={() => navigate({ to: "/clients" })}
          className="flex items-center gap-1 transition-colors"
          style={{ color: "var(--color-ink-30)" }}
        >
          <IconArrowLeft size={14} />
          Accounts
        </button>
        <span style={{ color: "rgba(26,26,24,0.3)" }}>/</span>
        <span className="font-medium">{c.company_name}</span>
        {!c.is_active && (
          <span
            className="ml-1 text-[11px] px-1.5 py-0.5 "
            style={{ background: "var(--color-ink-10)", color: "var(--color-ink-30)" }}
          >
            Inactive
          </span>
        )}
      </div>

      {/* Client snapshot */}
      <div
        className="mx-6 mt-5  p-[14px_18px]"
        style={{ background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: "var(--color-ink-60)" }}>
              Client snapshot
            </span>
            <span
              className="text-[11px] px-1.5 py-0.5 "
              style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
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
                <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
                  No active candidates with this client.
                </p>
              ) : (
                activePipeline.slice(0, 5).map((p) => (
                  <p key={p.id} className="text-[13px] mb-0.5">
                    <span className="font-medium">{p.candidates?.full_name ?? "—"}</span>
                    {" — "}
                    <span style={{ color: "var(--color-ink-60)" }}>
                      {p.reqTitle} ({p.stage})
                    </span>
                  </p>
                ))
              )}
            </div>
            {/* Col 3: Watch out */}
            <div>
              <p className="sl mb-1.5">Watch out</p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-danger)" }}>
                {snapshotData.watchOut}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
            Generate a snapshot to see where things stand, who is active, and what to watch for today.
          </p>
        )}
      </div>

      {/* Tab switcher */}
      <div
        className="flex gap-0 mx-6 mt-4"
        style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        {(
          [
            { key: "timeline",  label: "Timeline" },
            { key: "info",      label: "Client info" },
            { key: "contacts",  label: "Contacts" },
            { key: "jobs",      label: "Jobs" },
            { key: "contract",  label: "Contract" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setClientTab(key)}
            className={`nav-tab text-[13px]${clientTab === key ? " active" : ""}`}
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
            <ClientEnrichCard clientId={id} companyName={c.company_name} />
            <ClientIntelligenceCard
              clientId={id}
              aiContext={c.ai_context}
              aiContextUpdatedAt={c.ai_context_updated_at}
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
              onLogEvent={(type) => { setLogEventType(type); setLogInteractionOpen(true); }}
              onMeetingPrep={() => void generateMeetingPrep()}
              draftLoading={draftLoading}
            />
            <JapanMarketContextCard client={c} clientId={id} />
          </div>
        </div>
      )}

      {/* ── CONTACTS TAB ── */}
      {clientTab === "contacts" && (
        <div className="px-6 pt-4 pb-8 max-w-3xl space-y-3">
          <ContactsCard
            contacts={contacts}
            clientId={id}
            interactions={interactions}
            onAdd={() => setAddContactOpen(true)}
            onLogActivity={(contactId, contactName) => {
              setLogForContactId(contactId);
              setLogForContactName(contactName);
              setLogInteractionOpen(true);
            }}
          />
        </div>
      )}

      {/* ── JOBS TAB ── */}
      {clientTab === "jobs" && (
        <div className="px-6 pt-4 pb-8 max-w-3xl">
          <JobsTab
            clientId={id}
            recruiterId={user!.id}
            openReqs={openReqs}
            closedReqs={closedReqs}
            contacts={contacts}
          />
        </div>
      )}

      {/* ── CONTRACT TAB ── */}
      {clientTab === "contract" && (
        <div className="px-6 pt-4 pb-8 max-w-xl">
          <EditableContractTab client={c} clientId={id} />
        </div>
      )}

      {/* Dialogs */}
      <AddContactDialog
        clientId={id}
        recruiterId={user!.id}
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
      />
      <LogInteractionDialog
        clientId={id}
        recruiterId={user!.id}
        contacts={contacts}
        open={logInteractionOpen}
        onClose={() => { setLogInteractionOpen(false); setLogForContactId(null); setLogForContactName(null); }}
        initialType={logEventType}
        initialContactId={logForContactId}
        initialContactName={logForContactName}
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
      className={` p-[16px_18px] ${className}`}
      style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
    >
      {children}
    </div>
  );
}

function SL({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-medium uppercase tracking-[0.04em] mb-2"
      style={{ color: "var(--color-ink-60)" }}
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
          className="flex h-11 w-11 shrink-0 items-center justify-center  text-[13px] font-medium"
          style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)" }}
        >
          {initials(c.company_name)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-medium leading-tight font-display">{c.company_name}</h2>
          {/* Meta pills */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ClientStatusSelect
              clientId={c.id}
              currentStatus={c.status ?? "prospect"}
              contractSigned={c.contract_signed}
            />
            {c.contract_signed && (
              <MetaPill style={{ background: "var(--color-moss-light)", color: "var(--color-moss)", borderColor: "#c0dd97" }}>Contract signed</MetaPill>
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
              <MetaPill style={{ background: "var(--color-gold-light)", color: "var(--color-gold)", borderColor: "#fac775" }}>
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
            color: stats.placements > 0 ? "var(--color-moss)" : undefined,
          },
          {
            label: "Feedback overdue",
            value: stats.feedbackOverdue,
            color: stats.feedbackOverdue > 0 ? "var(--color-danger)" : undefined,
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className=" p-[10px_12px]"
            style={{ background: "var(--color-ink-10)" }}
          >
            <p
              className="text-[18px] font-medium leading-none mb-1 font-display"
              style={{ color: color ?? "var(--color-ink)" }}
            >
              {value}
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Completeness bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 mb-3"
        style={{ background: "var(--color-indigo-light)" }}
      >
        <IconFileText size={14} style={{ color: "var(--color-indigo)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px]" style={{ color: "var(--color-indigo)" }}>
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
              background: "var(--color-indigo)",
              borderRadius: 2,
            }}
          />
        </div>
        <span className="text-[11px] font-medium shrink-0" style={{ color: "var(--color-indigo)" }}>
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
            style={{ color: "var(--color-ink)" }}
            rows={4}
          />
        ) : (
          <p
            className="text-[13px] leading-[1.55] cursor-text"
            style={{ color: c.strategy_notes ? "var(--color-ink)" : "var(--color-ink-30)" }}
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
    active:   { background: "var(--color-moss-light)", color: "var(--color-moss)", borderColor: "#c0dd97" },
    prospect: { background: "var(--color-gold-light)", color: "var(--color-gold)", borderColor: "#fac775" },
    inactive: { background: "var(--color-ink-10)", color: "var(--color-ink-30)", borderColor: "var(--color-ink-15)" },
  };
  const s = styles[currentStatus] ?? styles.prospect;

  return (
    <select
      value={currentStatus}
      disabled={mutation.isPending}
      onChange={(e) => {
        if (e.target.value !== currentStatus) mutation.mutate(e.target.value);
      }}
      className="text-[12px] font-medium  px-[7px] py-[2px] outline-none cursor-pointer"
      style={{ border: `0.5px solid ${s.borderColor ?? "var(--color-ink-15)"}`, ...s }}
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
      className="text-[12px] px-[7px] py-[2px] "
      style={{
        background: "var(--color-ink-10)",
        border: "0.5px solid var(--color-ink-15)",
        color: "var(--color-ink-60)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── contacts card ────────────────────────────────────────────────────────────

const ROLE_AVATAR: Record<ContactRole, React.CSSProperties> = {
  hiring_manager: { background: "var(--color-indigo-light)", color: "var(--color-indigo)" },
  hr_gatekeeper: { background: "var(--color-ink-10)", color: "var(--color-ink-30)" },
  ta_coordinator: { background: "var(--color-gold-light)", color: "var(--color-gold)" },
  executive: { background: "var(--color-gold-light)", color: "var(--color-gold)" },
  other: { background: "var(--color-ink-10)", color: "var(--color-ink-30)" },
};

const ROLE_BADGE: Record<ContactRole, { label: string; style: React.CSSProperties }> = {
  hiring_manager: {
    label: "Decision maker",
    style: { background: "var(--color-indigo-light)", color: "var(--color-indigo)", borderColor: "#b5d4f4" },
  },
  hr_gatekeeper: {
    label: "HR gatekeeper",
    style: { background: "var(--color-ink-10)", color: "var(--color-ink-30)", borderColor: "var(--color-ink-15)" },
  },
  ta_coordinator: {
    label: "Scheduling owner",
    style: { background: "var(--color-gold-light)", color: "var(--color-gold)", borderColor: "#fac775" },
  },
  executive: {
    label: "Executive",
    style: { background: "var(--color-gold-light)", color: "var(--color-gold)", borderColor: "#fac775" },
  },
  other: {
    label: "Contact",
    style: { background: "var(--color-ink-10)", color: "var(--color-ink-30)", borderColor: "var(--color-ink-15)" },
  },
};

function ContactsCard({
  contacts,
  clientId,
  interactions,
  onAdd,
  onLogActivity,
}: {
  contacts: Contact[];
  clientId: string;
  interactions?: Interaction[];
  onAdd: () => void;
  onLogActivity?: (contactId: string, contactName: string) => void;
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
        <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
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
                    className="text-[12px] px-3 py-2 mb-1.5 leading-snug"
                    style={{ background: "var(--color-gold-light)", color: "var(--color-gold)" }}
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
                        <span className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
                          · {contact.title}
                        </span>
                      )}
                      <span
                        className="text-[11px] font-medium px-[7px] py-[2px]  border"
                        style={badge.style}
                      >
                        {badge.label}
                      </span>
                      {contact.is_primary && (
                        <span
                          className="text-[11px] font-medium px-[7px] py-[2px]  border"
                          style={{ background: "var(--color-gold-light)", color: "var(--color-gold)", borderColor: "#fac775" }}
                        >
                          Primary contact
                        </span>
                      )}
                    </div>

                    {/* Contact details */}
                    {(contact.email || contact.phone || contact.linkedin_url) && (
                      <div className="flex items-center gap-3 mt-0.5 mb-1">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="text-[11px]" style={{ color: "var(--color-indigo)" }}>{contact.email}</a>
                        )}
                        {contact.phone && (
                          <span className="text-[11px]" style={{ color: "var(--color-ink-60)" }}>{contact.phone}</span>
                        )}
                        {contact.linkedin_url && (
                          <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-[11px] underline underline-offset-2" style={{ color: "var(--color-indigo)" }}>LinkedIn</a>
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
                        className="w-full mt-1 text-[12px] leading-[1.4] px-2 py-1 resize-none"
                        style={{
                          border: "0.5px solid rgba(26,26,24,0.20)",
                          background: "var(--color-white)",
                          color: "var(--color-ink)",
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
                            style={{ color: "var(--color-ink-60)" }}
                          >
                            {contact.notes}
                          </p>
                        ) : (
                          <p
                            className="text-[12px] leading-[1.4]"
                            style={{ color: "var(--color-ink-30)" }}
                          >
                            Add a note about this contact...
                          </p>
                        )}
                      </button>
                    )}

                    {/* Contact activity footer */}
                    {onLogActivity && (
                      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "0.5px solid var(--color-border-subtle)" }}>
                        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                          {(interactions ?? []).filter((i) => i.contact_id === contact.id).length} interaction{(interactions ?? []).filter((i) => i.contact_id === contact.id).length !== 1 ? "s" : ""} logged
                        </span>
                        <button
                          className="ab"
                          onClick={() => onLogActivity(contact.id, contact.name)}
                        >
                          <IconPlus size={10} /> Log activity
                        </button>
                      </div>
                    )}

                    {/* Recent contact interactions */}
                    {onLogActivity && (interactions ?? []).filter((i) => i.contact_id === contact.id).length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {(interactions ?? [])
                          .filter((i) => i.contact_id === contact.id)
                          .slice(0, 3)
                          .map((i) => (
                            <div key={i.id} className="flex items-start gap-2 px-2 py-1.5" style={{ background: "var(--color-ink-10)" }}>
                              <span className="text-[11px] capitalize font-medium mt-0.5" style={{ color: "var(--color-ink-30)", minWidth: 36 }}>{i.interaction_type}</span>
                              <div className="flex-1 min-w-0">
                                {i.summary && <p className="text-[12px] truncate">{i.summary}</p>}
                                <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                                  {new Date(i.interacted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
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
  if (!score || dotIndex > score) return { background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)" };
  return { background: score >= 4 ? "var(--color-indigo)" : "#b5d4f4" };
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
        <span className="ml-1.5 text-[11px]" style={{ color: "var(--color-ink-30)" }}>
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
                className="flex items-center gap-3 w-full px-3 py-2 text-left transition-colors"
                style={{
                  background: score === i ? "var(--color-indigo-light)" : "var(--color-ink-10)",
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
                <span className="text-[12px]" style={{ color: "var(--color-ink)" }}>
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
  showHeader = true,
  onFindMatches,
  activeMatchReqId,
}: {
  reqs: ReqWithPipeline[];
  closedReqs: ReqWithPipeline[];
  contacts: Contact[];
  onAdd?: () => void;
  showHeader?: boolean;
  onFindMatches?: (reqId: string) => void;
  activeMatchReqId?: string | null;
}) {
  return (
    <Card>
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SL>Open jobs</SL>
            {reqs.length > 0 && (
              <span className="text-[11px] px-1.5 py-0.5  -mt-2" style={{ background: "var(--color-moss-light)", color: "var(--color-moss)" }}>
                {reqs.length}
              </span>
            )}
          </div>
          {onAdd && <button className="ab" onClick={onAdd}><IconPlus size={11} /> Add</button>}
        </div>
      )}

      {reqs.length === 0 && (
        <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
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
            style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}
          >
            {/* Left bar */}
            <div
              className="w-1 shrink-0 rounded-sm mt-[2px]"
              style={{ background: "#639922", alignSelf: "stretch", minHeight: 16 }}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium mb-0.5">{r.title}</p>
              <p className="text-[12px] mb-1.5" style={{ color: "var(--color-ink-60)" }}>
                {[
                  r.salary_range_text
                    ? r.salary_range_text
                    : r.salary_min || r.salary_max
                    ? `${formatYen(r.salary_min)}–${formatYen(r.salary_max)} base`
                    : null,
                  r.location ?? null,
                  r.interview_rounds ? `${r.interview_rounds} rounds` : null,
                  hm ? `HM: ${hm.name}` : null,
                  r.urgency_date ? `Close by ${new Date(r.urgency_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {/* Pipeline badges */}
              <div className="flex items-center gap-1 flex-wrap">
                {inInterview.length > 0 && (
                  <PipelineBadge style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)" }}>
                    {inInterview.length} in interview
                  </PipelineBadge>
                )}
                {atOffer.length > 0 && (
                  <PipelineBadge style={{ background: "#fff3e0", color: "var(--color-gold)", borderColor: "#ef9f27" }}>
                    {atOffer.length} at offer
                  </PipelineBadge>
                )}
                {cvsSent.length > 0 && inInterview.length === 0 && (
                  <PipelineBadge style={{ background: "var(--color-ink-10)", color: "var(--color-ink-30)" }}>
                    {cvsSent.length} CV sent
                  </PipelineBadge>
                )}
                {buyIn.length > 0 && (
                  <PipelineBadge style={{ background: "var(--color-gold-light)", color: "var(--color-gold)" }}>
                    {buyIn.length} buy-in secured
                  </PipelineBadge>
                )}
                {active.length === 0 && (
                  <PipelineBadge style={{ background: "var(--color-ink-10)", color: "var(--color-ink-30)" }}>
                    No pipeline
                  </PipelineBadge>
                )}
                <PipelineBadge
                  style={
                    r.is_backfill
                      ? { background: "var(--color-ink-10)", color: "var(--color-ink-30)" }
                      : { background: "var(--color-moss-light)", color: "var(--color-moss)" }
                  }
                >
                  {r.is_backfill ? "Backfill" : "Net-new"}
                </PipelineBadge>
              </div>

              {onFindMatches && (
                <div className="mt-2">
                  <button
                    className="ab flex items-center gap-1"
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      background: activeMatchReqId === r.id ? "var(--color-ink)" : undefined,
                      color: activeMatchReqId === r.id ? "var(--color-white)" : undefined,
                    }}
                    onClick={() => onFindMatches(r.id)}
                  >
                    <IconSearch size={11} />
                    {activeMatchReqId === r.id ? "Hide matches" : "Find matches"}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Closed reqs */}
      {closedReqs.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid var(--color-border-subtle)" }}>
          <p className="sl mb-2">Closed</p>
          {closedReqs.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 py-1.5 text-[12px]"
              style={{ color: "var(--color-ink-30)" }}
            >
              <div className="w-1 h-4 rounded-sm shrink-0" style={{ background: "var(--color-ink-15)" }} />
              {r.title}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── job match panel ──────────────────────────────────────────────────────────

function JobMatchPanel({
  requisitionId,
  clientId,
  recruiterId,
}: {
  requisitionId: string;
  clientId: string;
  recruiterId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [draftStates, setDraftStates] = useState<Record<string, { loading: boolean; text: string | null }>>({});

  useEffect(() => {
    void runSearch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId]);

  async function runSearch() {
    setLoading(true);
    setMatches(null);
    setDraftStates({});
    try {
      const resp = await fetch("/api/ai/advanced-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requisition_id: requisitionId,
          client_id: clientId,
          threshold: 50,
          recruiter_id: recruiterId,
        }),
      });
      const data = (await resp.json()) as { matches?: AiMatchResult[]; error?: string };
      if (data.error || !data.matches) {
        toast.error("Could not load matches. Try again.");
        setLoading(false);
        return;
      }

      const top = data.matches.slice(0, 8);
      if (top.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      // Enrich with candidate names from DB
      const { data: cands } = await supabase
        .from("candidates")
        .select("id, full_name, current_title, current_company")
        .in("id", top.map((m) => m.candidate_id));

      const candMap = new Map(
        ((cands ?? []) as { id: string; full_name: string; current_title: string | null; current_company: string | null }[])
          .map((c) => [c.id, c]),
      );

      setMatches(
        top.map((m) => ({
          ...m,
          full_name: candMap.get(m.candidate_id)?.full_name ?? "Unknown",
          current_title: candMap.get(m.candidate_id)?.current_title ?? null,
          current_company: candMap.get(m.candidate_id)?.current_company ?? null,
        })),
      );
    } catch {
      toast.error("Could not load matches. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function draftMessage(candidateId: string) {
    setDraftStates((prev) => ({ ...prev, [candidateId]: { loading: true, text: null } }));
    try {
      const resp = await fetch("/api/ai/job-spec-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          requisition_id: requisitionId,
          recruiter_id: recruiterId,
        }),
      });
      const data = (await resp.json()) as { message?: string; error?: string };
      if (data.error || !data.message) {
        toast.error("Could not draft message. Try again.");
        setDraftStates((prev) => ({ ...prev, [candidateId]: { loading: false, text: null } }));
        return;
      }
      setDraftStates((prev) => ({ ...prev, [candidateId]: { loading: false, text: data.message! } }));
    } catch {
      toast.error("Could not draft message. Try again.");
      setDraftStates((prev) => ({ ...prev, [candidateId]: { loading: false, text: null } }));
    }
  }

  function ScoreBar({ score }: { score: number }) {
    const color = score >= 80 ? "var(--color-moss)" : score >= 60 ? "var(--color-indigo)" : "var(--color-gold)";
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1" style={{ background: "var(--color-ink-15)" }}>
          <div style={{ width: `${score}%`, height: "100%", background: color }} />
        </div>
        <span className="text-[11px] font-mono w-7 text-right" style={{ color }}>{score}%</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
        <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>Finding matched candidates…</p>
      </div>
    );
  }

  if (matches === null) return null;

  if (matches.length === 0) {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
        <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>No matched candidates above threshold. Try adjusting the role criteria.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
      <p className="text-[11px] font-mono uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>
        {matches.length} matched candidate{matches.length !== 1 ? "s" : ""}
      </p>
      {matches.map((m) => {
        const draft = draftStates[m.candidate_id];
        return (
          <div
            key={m.candidate_id}
            className="p-3 space-y-2"
            style={{ background: "var(--color-ink-05)", border: "0.5px solid var(--color-ink-15)" }}
          >
            {/* Candidate header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium">{m.full_name}</p>
                {(m.current_title ?? m.current_company) && (
                  <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                    {[m.current_title, m.current_company].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!m.meets_must_haves && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5"
                    style={{ background: "var(--color-gold-light)", color: "var(--color-gold)", border: "0.5px solid rgba(184,146,42,0.3)" }}
                  >
                    stretch
                  </span>
                )}
                {m.is_salary_stretch && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5"
                    style={{ background: "var(--color-gold-light)", color: "var(--color-gold)", border: "0.5px solid rgba(184,146,42,0.3)" }}
                  >
                    ¥ stretch
                  </span>
                )}
              </div>
            </div>

            {/* Score bar */}
            <ScoreBar score={m.score} />

            {/* AI reason */}
            <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>{m.reason}</p>

            {/* Draft message */}
            {draft?.text ? (
              <div className="space-y-1.5">
                <Textarea
                  value={draft.text}
                  onChange={(e) =>
                    setDraftStates((prev) => ({
                      ...prev,
                      [m.candidate_id]: { loading: false, text: e.target.value },
                    }))
                  }
                  className="text-[12px] min-h-[100px] font-sans"
                  style={{ resize: "vertical" }}
                />
                <div className="flex items-center gap-2">
                  <button
                    className="ab flex items-center gap-1"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => {
                      void navigator.clipboard.writeText(draft.text ?? "");
                      toast.success("Copied.");
                    }}
                  >
                    <IconCopy size={10} />
                    Copy
                  </button>
                  <button
                    className="ab flex items-center gap-1"
                    style={{ fontSize: 11, padding: "3px 8px" }}
                    onClick={() => void draftMessage(m.candidate_id)}
                  >
                    <IconSparkles size={10} />
                    Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="ab flex items-center gap-1"
                style={{ fontSize: 11, padding: "4px 10px" }}
                onClick={() => void draftMessage(m.candidate_id)}
                disabled={draft?.loading}
              >
                <IconMessageCircle size={11} />
                {draft?.loading ? "Drafting…" : "Draft message"}
              </button>
            )}
          </div>
        );
      })}
    </div>
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
      className="text-[11px] font-medium px-[7px] py-[2px] "
      style={{ border: "0.5px solid var(--color-ink-15)", ...style }}
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
    bg: "var(--color-danger-bg)",
    border: "var(--color-danger)",
    titleColor: "#791f1f",
    bodyColor: "var(--color-danger)",
    btnBg: "var(--color-danger)",
    btnColor: "var(--color-white)",
  },
  warning: {
    bg: "var(--color-gold-light)",
    border: "#ef9f27",
    titleColor: "var(--color-gold)",
    bodyColor: "#854f0b",
    btnBg: "var(--color-gold)",
    btnColor: "var(--color-white)",
  },
  info: {
    bg: "var(--color-indigo-light)",
    border: "var(--color-indigo)",
    titleColor: "#0c447c",
    bodyColor: "var(--color-indigo)",
    btnBg: "var(--color-indigo)",
    btnColor: "var(--color-white)",
  },
  nudge: {
    bg: "var(--color-moss-light)",
    border: "#639922",
    titleColor: "var(--color-moss)",
    bodyColor: "#3b6d11",
    btnBg: "var(--color-moss)",
    btnColor: "var(--color-white)",
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
        <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
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
                className=" p-[10px_12px]"
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
                  className="text-[11px] font-medium px-[9px] py-[4px]  flex items-center gap-1"
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
  onLogEvent,
  onMeetingPrep,
  draftLoading,
}: {
  onLogEvent: (type: "call" | "email" | "meeting") => void;
  onMeetingPrep: () => void;
  draftLoading: boolean;
}) {
  const [showEventMenu, setShowEventMenu] = useState(false);

  const btnBase: React.CSSProperties = {
    border: "0.5px solid var(--color-ink-15)",
    background: "var(--color-white)",
  };

  return (
    <Card>
      <SL>Quick actions</SL>
      <div className="space-y-1.5">

        <button
          onClick={onMeetingPrep}
          disabled={draftLoading}
          className="flex items-center gap-2 w-full text-left text-[13px] px-3 py-2"
          style={{ ...btnBase, opacity: draftLoading ? 0.6 : 1 }}
          onMouseEnter={(e) => { if (!draftLoading) e.currentTarget.style.background = "var(--color-ink-10)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-white)"; }}
        >
          <IconSparkles size={14} style={{ color: "var(--color-ink-60)" }} />
          {draftLoading ? "Generating…" : "Prep for client meeting ↗"}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowEventMenu((v) => !v)}
            className="flex items-center gap-2 w-full text-left text-[13px] px-3 py-2"
            style={{ ...btnBase, background: showEventMenu ? "var(--color-ink-10)" : "var(--color-white)" }}
          >
            <IconPhone size={14} style={{ color: "var(--color-ink-60)" }} />
            Log event
            <span className="ml-auto text-[10px]" style={{ color: "var(--color-ink-30)" }}>
              {showEventMenu ? "▴" : "▾"}
            </span>
          </button>
          {showEventMenu && (
            <div
              className="absolute left-0 right-0 top-full mt-1  overflow-hidden z-10"
              style={{
                border: "0.5px solid var(--color-ink-15)",
                background: "var(--color-white)",
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
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-ink-10)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-white)"; }}
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

// ─── japan market context card (editable) ─────────────────────────────────────

function JapanMarketContextCard({ client: c, clientId }: { client: ClientRecord; clientId: string }) {
  const qc = useQueryClient();

  type EditableField = "years_in_japan" | "japan_team_size" | "japan_team_japanese_pct" | "japan_role_in_group" | "kk_entity";
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState<string>("");

  function startEdit(field: EditableField, current: string | number | null) {
    setEditing(field);
    setDraft(current != null ? String(current) : "");
  }

  async function saveField(field: EditableField) {
    setEditing(null);
    const isNumericField = field === "years_in_japan" || field === "japan_team_size" || field === "japan_team_japanese_pct";
    if (isNumericField) {
      const n = parseInt(draft.trim());
      const numValue = isNaN(n) ? null : n;
      if (field === "years_in_japan") await supabase.from("clients").update({ years_in_japan: numValue }).eq("id", clientId);
      else if (field === "japan_team_size") await supabase.from("clients").update({ japan_team_size: numValue }).eq("id", clientId);
      else if (field === "japan_team_japanese_pct") await supabase.from("clients").update({ japan_team_japanese_pct: numValue }).eq("id", clientId);
    } else {
      const strValue = draft.trim() || null;
      if (field === "japan_role_in_group") await supabase.from("clients").update({ japan_role_in_group: strValue }).eq("id", clientId);
      else if (field === "kk_entity") await supabase.from("clients").update({ kk_entity: strValue }).eq("id", clientId);
    }
    void qc.invalidateQueries({ queryKey: ["client", clientId] });
  }

  type FieldDef = { field: EditableField; label: string; rawValue: string | number | null; displayValue: string; placeholder: string };
  const fields: FieldDef[] = [
    { field: "years_in_japan", label: "Years in Japan", rawValue: c.years_in_japan, displayValue: c.years_in_japan ? `${c.years_in_japan} years` : "", placeholder: "e.g. 15" },
    { field: "japan_team_size", label: "Employees in Japan", rawValue: c.japan_team_size, displayValue: c.japan_team_size ? `~${c.japan_team_size.toLocaleString()}` : "", placeholder: "e.g. 200" },
    { field: "japan_team_japanese_pct", label: "% Japanese nationals", rawValue: c.japan_team_japanese_pct, displayValue: c.japan_team_japanese_pct ? `~${c.japan_team_japanese_pct}%` : "", placeholder: "e.g. 70" },
    { field: "japan_role_in_group", label: "Japan role in group", rawValue: c.japan_role_in_group, displayValue: c.japan_role_in_group ?? "", placeholder: "e.g. Regional HQ" },
    { field: "kk_entity", label: "KK entity", rawValue: c.kk_entity, displayValue: c.kk_entity ?? "", placeholder: "Yes / No / Entity name" },
  ];

  return (
    <Card>
      <SL>Japan market context</SL>
      <div className="space-y-[2px] mb-3">
        {fields.map(({ field, label, rawValue, displayValue, placeholder }) => {
          const isEditing = editing === field;
          return (
            <div
              key={field}
              className="px-2.5 py-2"
              style={{
                background: isEditing ? "var(--color-ink-10)" : "transparent",
                border: isEditing ? "0.5px solid rgba(26,26,24,0.15)" : "0.5px solid transparent",
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{label}</span>
                {!isEditing && (
                  <button
                    className="text-[10px] px-1.5 py-0.5  opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--color-ink-30)" }}
                    onClick={() => startEdit(field, rawValue)}
                  >
                    <IconPencil size={10} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void saveField(field)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveField(field);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    placeholder={placeholder}
                    className="flex-1 text-[13px] bg-transparent outline-none"
                    style={{ color: "var(--color-ink)" }}
                  />
                  <button
                    className="text-[11px] px-2 py-0.5  shrink-0"
                    style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
                    onMouseDown={(e) => { e.preventDefault(); void saveField(field); }}
                  >
                    Save
                  </button>
                  <button
                    className="text-[11px] shrink-0"
                    style={{ color: "var(--color-ink-30)" }}
                    onMouseDown={(e) => { e.preventDefault(); setEditing(null); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 group">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: displayValue ? "var(--color-ink)" : "var(--color-ink-30)" }}
                  >
                    {displayValue || "Not set"}
                  </span>
                  <button
                    className="text-[10px] px-1.5 py-0.5  shrink-0"
                    style={{ color: "var(--color-ink-30)", opacity: 0.6 }}
                    onClick={() => startEdit(field, rawValue)}
                    title="Edit"
                  >
                    <IconPencil size={10} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug" style={{ color: "var(--color-ink-30)" }}>
        Use these facts when pitching {c.company_name} to candidates from domestic firms.
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

// ─── jobs tab ─────────────────────────────────────────────────────────────────

type AddJobForm = {
  title: string;
  salary_range_text: string;
  location: string;
  urgency_date: string;
  hiring_manager_id: string;
  why_role_opened: string;
  strategic_context: string;
};

const EMPTY_ADD_JOB: AddJobForm = {
  title: "",
  salary_range_text: "",
  location: "",
  urgency_date: "",
  hiring_manager_id: "",
  why_role_opened: "",
  strategic_context: "",
};

function JobsTab({
  clientId,
  recruiterId,
  openReqs,
  closedReqs,
  contacts,
}: {
  clientId: string;
  recruiterId: string;
  openReqs: ReqWithPipeline[];
  closedReqs: ReqWithPipeline[];
  contacts: Contact[];
}) {
  const qc = useQueryClient();
  const jdInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddJobForm>(EMPTY_ADD_JOB);
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [jdUploading, setJdUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generatingContext, setGeneratingContext] = useState(false);
  const [activeMatchReqId, setActiveMatchReqId] = useState<string | null>(null);

  function handleFindMatches(reqId: string) {
    setActiveMatchReqId((prev) => (prev === reqId ? null : reqId));
  }

  async function handleJdFile(file: File) {
    setJdUploading(true);
    try {
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
        const data = (await resp.json()) as { text?: string };
        extractedText = data.text?.trim() ?? "";
      }
      const path = `${recruiterId}/${clientId}/jd_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("resumes").upload(path, file);
      if (!error) setJdUrl(path);
      setJdText(extractedText);
      toast.success("JD uploaded.");
      if (extractedText.length > 50) {
        setExtracting(true);
        try {
          const resp = await fetch("/api/ai/extract-req-fields", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jd_text: extractedText }),
          });
          const json = (await resp.json()) as { data?: Partial<AddJobForm> };
          if (json.data) {
            setForm((p) => ({
              ...p,
              title: json.data?.title ?? p.title,
              salary_range_text: json.data?.salary_range_text ?? p.salary_range_text,
              location: json.data?.location ?? p.location,
            }));
            toast.success("Fields extracted from JD — review before saving.");
          }
        } finally {
          setExtracting(false);
        }
      }
    } catch {
      toast.error("JD upload failed.");
    } finally {
      setJdUploading(false);
    }
  }

  async function generateStrategicContext() {
    if (!form.title.trim()) { toast.error("Enter a role title first."); return; }
    setGeneratingContext(true);
    try {
      const resp = await fetch("/api/ai/req-strategic-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, title: form.title.trim(), whyRoleOpened: form.why_role_opened.trim(), isBackfill: false }),
      });
      const json = (await resp.json()) as { content?: string };
      if (json.content) setForm((p) => ({ ...p, strategic_context: json.content! }));
    } catch {
      toast.error("Failed to generate draft.");
    } finally {
      setGeneratingContext(false);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("requisitions").insert({
        client_id: clientId,
        recruiter_id: recruiterId,
        is_open: true,
        is_backfill: false,
        title: form.title.trim(),
        salary_range_text: form.salary_range_text.trim() || null,
        location: form.location.trim() || null,
        urgency_date: form.urgency_date || null,
        hiring_manager_id: form.hiring_manager_id || null,
        why_role_opened: form.why_role_opened.trim() || null,
        strategic_context: form.strategic_context.trim() || null,
        jd_text: jdText || null,
        jd_url: jdUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Job saved.");
      setForm(EMPTY_ADD_JOB);
      setJdText("");
      setJdUrl("");
      setShowForm(false);
    },
    onError: () => toast.error("Failed to save job."),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBriefcase size={16} style={{ color: "var(--color-ink-60)" }} />
          <span className="text-[13px] font-medium">
            {openReqs.length} open job{openReqs.length !== 1 ? "s" : ""}
            {closedReqs.length > 0 && <span className="ml-1 font-normal" style={{ color: "var(--color-ink-30)" }}>· {closedReqs.length} closed</span>}
          </span>
        </div>
        <button className="ab" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><IconX size={11} /> Cancel</> : <><IconPlus size={11} /> Add job</>}
        </button>
      </div>

      {/* Add job inline form */}
      {showForm && (
        <div className=" p-4 space-y-4" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
          {/* JD upload */}
          <div
            className=" px-4 py-3 flex items-center gap-3 cursor-pointer"
            style={{
              background: jdText ? "var(--color-moss-light)" : "var(--color-ink-10)",
              border: `0.5px dashed ${jdText ? "rgba(39,80,10,0.3)" : "rgba(26,26,24,0.2)"}`,
            }}
            onClick={() => !jdUploading && jdInputRef.current?.click()}
          >
            <IconUpload size={14} style={{ color: jdText ? "#3b6d11" : "var(--color-ink-30)", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                {jdUploading ? "Uploading…" : extracting ? "Extracting fields…" : jdText ? "JD uploaded — fields extracted below" : "Upload job description (PDF or DOCX) — AI will fill what it can"}
              </p>
            </div>
            {jdText && <span className="text-[11px]" style={{ color: "var(--color-moss)" }}>✓</span>}
            <input ref={jdInputRef} type="file" accept=".pdf,.docx" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleJdFile(f); e.target.value = ""; }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label="Job title *">
              <Input autoFocus value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. VP of Engineering" />
            </F>
            <F label="Location">
              <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="e.g. Tokyo, hybrid" />
            </F>
          </div>

          <F label="Salary range">
            <Input value={form.salary_range_text} onChange={(e) => setForm((p) => ({ ...p, salary_range_text: e.target.value }))} placeholder="e.g. ¥8M–¥12M base + 15% bonus" />
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Hiring manager">
              <Select value={form.hiring_manager_id} onValueChange={(v) => setForm((p) => ({ ...p, hiring_manager_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select contact…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No hiring manager</SelectItem>
                  {contacts.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
            <F label="Target close date">
              <Input type="date" value={form.urgency_date} onChange={(e) => setForm((p) => ({ ...p, urgency_date: e.target.value }))} />
            </F>
          </div>

          <F label="Why does this role exist?">
            <Textarea value={form.why_role_opened} onChange={(e) => setForm((p) => ({ ...p, why_role_opened: e.target.value }))} placeholder="New headcount, backfill, expansion…" className="min-h-[60px]" />
          </F>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Strategic context</Label>
              <button className="ab flex items-center gap-1" onClick={() => void generateStrategicContext()} disabled={generatingContext}>
                <IconSparkles size={10} />
                {generatingContext ? "Generating…" : "Generate draft ↗"}
              </button>
            </div>
            <Textarea value={form.strategic_context} onChange={(e) => setForm((p) => ({ ...p, strategic_context: e.target.value }))} placeholder="Why this role matters to the business right now" className="min-h-[70px]" />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={() => mutation.mutate()} disabled={!form.title.trim() || mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save job"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Open jobs */}
      {openReqs.length > 0 && (
        <>
          <OpenRequisitionsCard
            reqs={openReqs}
            closedReqs={[]}
            contacts={contacts}
            showHeader={false}
            onFindMatches={handleFindMatches}
            activeMatchReqId={activeMatchReqId}
          />
          {activeMatchReqId && (
            <JobMatchPanel
              requisitionId={activeMatchReqId}
              clientId={clientId}
              recruiterId={recruiterId}
            />
          )}
        </>
      )}

      {openReqs.length === 0 && !showForm && (
        <div className=" px-5 py-12 text-center" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
          <p className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>No open jobs.</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--color-ink-30)" }}>Upload a job description or fill in the form to add one.</p>
        </div>
      )}

      {/* Closed jobs — always render section */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.04em] mb-2" style={{ color: "var(--color-ink-60)" }}>Closed jobs</p>
        {closedReqs.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No closed jobs.</p>
        ) : (
          <div className=" overflow-hidden" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
            {closedReqs.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-4 py-2.5 text-[12px]"
                style={{ borderBottom: "0.5px solid rgba(26,26,24,0.06)", color: "var(--color-ink-30)" }}
              >
                <div className="w-1 h-4 rounded-sm shrink-0" style={{ background: "var(--color-ink-15)" }} />
                {r.title}
                {r.salary_range_text && (
                  <span className="ml-auto shrink-0" style={{ color: "var(--color-ink-30)" }}>{r.salary_range_text}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── log interaction dialog ───────────────────────────────────────────────────

function LogInteractionDialog({
  clientId,
  recruiterId,
  contacts,
  open,
  onClose,
  initialType = "call",
  initialContactId = null,
  initialContactName = null,
}: {
  clientId: string;
  recruiterId: string;
  contacts: Contact[];
  open: boolean;
  onClose: () => void;
  initialType?: string;
  initialContactId?: string | null;
  initialContactName?: string | null;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState(initialType);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState<string | null>(initialContactId);
  const [primaryParty, setPrimaryParty] = useState<"client" | "candidate">("client");

  useEffect(() => {
    if (open) {
      setType(initialType);
      setContactId(initialContactId);
      setPrimaryParty("client");
      setSummary("");
      setNotes("");
    }
  }, [open, initialType, initialContactId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("interactions").insert({
        client_id: clientId,
        recruiter_id: recruiterId,
        interaction_type: type,
        summary: summary.trim() || null,
        full_notes: notes.trim() || null,
        interacted_at: new Date().toISOString(),
        contact_id: contactId || null,
        primary_party: primaryParty,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Interaction logged");
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
          <div className="grid grid-cols-2 gap-3">
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
            <F label="Who you spoke with">
              <Select value={primaryParty} onValueChange={(v) => setPrimaryParty(v as "client" | "candidate")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client contact</SelectItem>
                  <SelectItem value="candidate">Candidate</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>

          {primaryParty === "client" && contacts.length > 0 && (
            <F label="Contact (optional)">
              <Select value={contactId ?? "__none__"} onValueChange={(v) => setContactId(v === "__none__" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Select contact…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No specific contact</SelectItem>
                  {contacts.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          )}

          <F label="Summary (1 line — shown in activity feed)">
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={initialContactName ? `e.g. Call with ${initialContactName} — topic discussed` : "e.g. Call with Yamada — discussed VP Eng req, 4 rounds confirmed"}
              autoFocus
            />
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
                {copied ? <IconCheck size={11} style={{ color: "var(--color-moss)" }} /> : <IconCopy size={11} />}
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
              className="w-full  p-3 text-[13px] leading-relaxed resize-none"
              style={{
                border: "0.5px solid rgba(26,26,24,0.20)",
                background: "var(--color-white)",
                minHeight: 320,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          ) : (
            <div
              className="text-[13px] leading-relaxed  p-3"
              style={{
                background: "var(--color-ink-10)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {displayContent}
            </div>
          )}
        </div>

        <p className="text-[11px] mt-2" style={{ color: "var(--color-ink-30)" }}>
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
    <div className=" overflow-hidden" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
      <button className="w-full flex items-center gap-2 px-4 py-3 text-left" onClick={() => setExpanded((v) => !v)}>
        <IconSparkles size={13} style={{ color: "var(--color-ink-30)" }} />
        <span className="flex-1 text-[12px]" style={{ color: "var(--color-ink-60)" }}>Enrich company profile with web search</span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-[11px] mb-2" style={{ color: "var(--color-ink-30)" }}>
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
            <div className="mt-3  p-3" style={{ background: "var(--color-ink-10)" }}>
              <p className="sl mb-2">Enrichment results — review before applying</p>
              <div className="space-y-1.5 mb-3">
                {previewRows.filter((r) => r.value != null).map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{label}</span>
                    <span className="text-[12px] font-medium text-right" style={{ maxWidth: 240, color: "var(--color-ink)" }}>{value}</span>
                  </div>
                ))}
                {previewRows.every((r) => r.value == null) && (
                  <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>No data found. Try adding the company URL.</p>
                )}
              </div>
              {result.sourceUrls && result.sourceUrls.length > 0 && (
                <p className="text-[11px] mb-3" style={{ color: "var(--color-ink-30)" }}>
                  Sources: {result.sourceUrls.slice(0, 3).map((u) => new URL(u).hostname).join(", ")}
                </p>
              )}
              <div className="flex gap-2">
                <button className="ab" onClick={() => void apply()} disabled={applying}>{applying ? "Applying…" : "Apply to profile"}</button>
                <button className="text-[11px]" style={{ color: "var(--color-ink-30)" }} onClick={() => setResult(null)}>Discard</button>
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
  call:    { bg: "var(--color-indigo-light)", color: "var(--color-indigo)" },
  email:   { bg: "var(--color-ink-10)", color: "var(--color-ink-60)" },
  meeting: { bg: "var(--color-moss-light)", color: "#3b6d11" },
};

function formatInteractionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ClientTimelineTab({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return (
      <div
        className=" px-5 py-12 text-center"
        style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
      >
        <p className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>No interactions logged yet.</p>
        <p className="text-[12px] mt-1" style={{ color: "var(--color-ink-30)" }}>
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
            className=" p-[14px_18px]"
            style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center  mt-0.5"
                style={{ background: colors.bg }}
              >
                <Icon size={14} style={{ color: colors.color }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="text-[11px] font-medium capitalize px-[6px] py-[2px] "
                    style={{ background: colors.bg, color: colors.color }}
                  >
                    {type}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                    {formatInteractionDate(item.interacted_at)}
                  </span>
                  {item.client_contacts && (
                    <span className="text-[11px] px-[6px] py-[2px] " style={{ background: "var(--color-ink-10)", color: "var(--color-ink-60)" }}>
                      with {item.client_contacts.name}
                    </span>
                  )}
                  {item.candidates && (
                    <span className="text-[11px] px-[6px] py-[2px] " style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)" }}>
                      re: {item.candidates.full_name}
                    </span>
                  )}
                  {item.primary_party === "candidate" && (
                    <span className="text-[11px] px-[6px] py-[2px] " style={{ background: "var(--color-moss-light)", color: "var(--color-moss)" }}>
                      spoke with candidate
                    </span>
                  )}
                </div>

                {item.summary && (
                  <p className="text-[13px] font-medium mb-0.5">{item.summary}</p>
                )}
                {item.full_notes && (
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-ink-60)" }}>
                    {item.full_notes}
                  </p>
                )}
                {!item.summary && !item.full_notes && (
                  <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>No notes recorded.</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── editable contract tab ────────────────────────────────────────────────────

function EditableContractTab({ client: c, clientId }: { client: ClientRecord; clientId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);

  async function handleViewContract(e: React.MouseEvent) {
    e.stopPropagation();
    if (!c.contract_url) return;
    setFetchingUrl(true);
    try {
      const { data, error } = await supabase.storage.from("resumes").createSignedUrl(c.contract_url, 120);
      if (error || !data?.signedUrl) { toast.error("Could not open contract. Try again."); return; }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open contract. Try again.");
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleRemoveContract(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this contract? The file will be deleted and contract status will be cleared.")) return;
    if (c.contract_url) {
      await supabase.storage.from("resumes").remove([c.contract_url]);
    }
    await supabase.from("clients").update({ contract_url: null, contract_signed: false }).eq("id", clientId);
    void qc.invalidateQueries({ queryKey: ["client", clientId] });
    toast.success("Contract removed.");
  }

  async function handleContractFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF contracts are supported. Please convert your document to PDF and try again.");
      return;
    }
    setUploading(true);
    try {
      // Path must start with auth.uid() to satisfy storage RLS policy
      const path = `${user!.id}/${clientId}/contract_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from("resumes").upload(path, file);
      if (error) throw error;

      const extractBody = { storageKey: path };

      let extractedFields: { fee_pct?: number; started_at?: string } = {};
      setExtracting(true);
      try {
        const resp = await fetch("/api/ai/extract-contract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(extractBody),
        });
        const json = (await resp.json()) as { data?: { fee_pct?: number; started_at?: string } };
        if (json.data && Object.keys(json.data).length > 0) {
          extractedFields = json.data;
        }
      } catch {
        toast.error("Could not extract contract fields. Upload saved, but fee % and start date were not auto-filled.");
      } finally {
        setExtracting(false);
      }

      await supabase
        .from("clients")
        .update({ contract_signed: true, contract_url: path, ...extractedFields })
        .eq("id", clientId);
      void qc.invalidateQueries({ queryKey: ["client", clientId] });
      if (Object.keys(extractedFields).length > 0) {
        toast.success("Contract uploaded and fields extracted.");
      } else {
        toast.success("Contract uploaded.");
      }
    } catch {
      toast.error("Contract upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className=" px-4 py-4 flex items-center gap-3 cursor-pointer"
        style={{
          background: c.contract_signed ? "var(--color-moss-light)" : "var(--color-ink-10)",
          border: `0.5px dashed ${c.contract_signed ? "rgba(39,80,10,0.3)" : "rgba(26,26,24,0.2)"}`,
        }}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        <IconUpload size={16} style={{ color: c.contract_signed ? "#3b6d11" : "var(--color-ink-30)", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium" style={{ color: c.contract_signed ? "var(--color-moss)" : "var(--color-ink)" }}>
            {uploading ? "Uploading…" : extracting ? "Extracting fields…" : c.contract_signed ? "Contract on file" : "Upload contract"}
          </p>
          <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            {c.contract_signed ? "PDF — re-upload to update" : "PDF — AI will extract fee % and start date"}
          </p>
        </div>
        {c.contract_signed && c.contract_url && (
          <button
            onClick={handleViewContract}
            disabled={fetchingUrl}
            className="text-[11px] px-2 py-0.5 shrink-0"
            style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)", border: "0.5px solid rgba(24,95,165,0.3)" }}
          >
            {fetchingUrl ? "Opening…" : "View"}
          </button>
        )}
        {c.contract_signed && (
          <>
            <span className="text-[11px] px-[7px] py-[2px]" style={{ background: "var(--color-moss-light)", color: "var(--color-moss)", border: "0.5px solid #c0dd97" }}>
              Signed
            </span>
            <button
              onClick={handleRemoveContract}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] shrink-0"
              style={{ background: "var(--color-white)", color: "var(--color-ink-60)", border: "0.5px solid var(--color-ink-15)" }}
              title="Remove contract"
            >
              <IconX size={10} /> Remove
            </button>
          </>
        )}
        <input ref={fileRef} type="file" accept=".pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleContractFile(f); e.target.value = ""; }} />
      </div>

      {/* Editable fields */}
      <div className=" p-[18px_20px]" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
        <p className="sl mb-4">Contract details</p>
        <ContractFieldRow
          label="Placement fee %"
          value={c.fee_pct != null ? String(c.fee_pct) : ""}
          placeholder="e.g. 30"
          type="number"
          onSave={async (v) => {
            const n = parseFloat(v);
            await supabase.from("clients").update({ fee_pct: isNaN(n) ? null : n }).eq("id", clientId);
            void qc.invalidateQueries({ queryKey: ["client", clientId] });
          }}
          display={c.fee_pct != null ? `${c.fee_pct}%` : null}
        />
        <ContractFieldRow
          label="Client since"
          value={c.started_at ? c.started_at.split("T")[0] : ""}
          placeholder="YYYY-MM-DD"
          type="date"
          onSave={async (v) => {
            await supabase.from("clients").update({ started_at: v || null }).eq("id", clientId);
            void qc.invalidateQueries({ queryKey: ["client", clientId] });
          }}
          display={c.started_at ? new Date(c.started_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null}
        />
        <ContractFieldRow
          label="Contract signed"
          value={c.contract_signed ? "Yes" : "No"}
          placeholder=""
          type="select"
          selectOptions={["Yes", "No"]}
          onSave={async (v) => {
            await supabase.from("clients").update({ contract_signed: v === "Yes" }).eq("id", clientId);
            void qc.invalidateQueries({ queryKey: ["client", clientId] });
          }}
          display={c.contract_signed ? "Yes" : "No"}
        />
      </div>
    </div>
  );
}

function ContractFieldRow({
  label,
  value,
  placeholder,
  type,
  selectOptions,
  onSave,
  display,
}: {
  label: string;
  value: string;
  placeholder: string;
  type: "text" | "number" | "date" | "select";
  selectOptions?: string[];
  onSave: (v: string) => Promise<void>;
  display: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function save() {
    setEditing(false);
    await onSave(draft.trim());
  }

  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border-subtle)" }}>
      <span className="text-[12px]" style={{ color: "var(--color-ink-30)", minWidth: 120 }}>{label}</span>
      {editing ? (
        type === "select" ? (
          <select
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            className="text-[13px] font-medium bg-transparent outline-none border-b"
            style={{ borderColor: "rgba(26,26,24,0.20)", color: "var(--color-ink)" }}
          >
            {(selectOptions ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setEditing(false); }}
            placeholder={placeholder}
            className="text-[13px] font-medium text-right bg-transparent outline-none border-b flex-1 ml-4"
            style={{ borderColor: "rgba(26,26,24,0.20)", color: "var(--color-ink)" }}
          />
        )
      ) : (
        <button
          className="text-[13px] font-medium"
          style={{ color: display ? "var(--color-ink)" : "var(--color-ink-30)" }}
          onClick={() => { setDraft(value); setEditing(true); }}
          title="Click to edit"
        >
          {display ?? "—"}
        </button>
      )}
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
    <div className=" overflow-hidden" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
      <button className="w-full flex items-center gap-2 px-4 py-3 text-left" onClick={() => setExpanded((v) => !v)}>
        <IconSparkles size={13} style={{ color: "var(--color-ink-30)" }} />
        <span className="flex-1 text-[12px] font-medium" style={{ color: "var(--color-ink-60)" }}>Account intelligence</span>
        {aiContextUpdatedAt && (
          <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>Updated {relTime(aiContextUpdatedAt)}</span>
        )}
        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {aiContext ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap mb-3" style={{ color: "var(--color-ink)" }}>{aiContext}</p>
          ) : (
            <p className="text-[13px] mb-3" style={{ color: "var(--color-ink-30)" }}>
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
