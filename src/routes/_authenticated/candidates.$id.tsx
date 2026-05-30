import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  initials,
  relativeTime,
  formatYen,
  daysSince,
} from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { FieldRow } from "@/components/shared/FieldRow";
import { Card } from "@/components/shared/Card";
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
  IconLock,
  IconInfoCircle,
  IconBuilding,
  IconSparkles,
  IconPhone,
  IconMail,
  IconCalendar,
  IconFileText,
  IconShield,
  IconMessage,
  IconCurrencyYen,
  IconBolt,
  IconPlus,
  IconPencil,
  IconCheck,
} from "@tabler/icons-react";
import { useRef } from "react";

export const Route = createFileRoute("/_authenticated/candidates/$id")({
  component: CandidateProfile,
});

// ─── types ───────────────────────────────────────────────────────────────────

type Candidate = {
  id: string;
  full_name: string;
  full_name_japanese: string | null;
  age: number | null;
  current_company: string | null;
  current_title: string | null;
  japanese_level: string | null;
  english_level: string | null;
  other_languages: string | null;
  additional_languages: string | null;
  active_passive: string | null;
  urgency_to_move: string | null;
  candidate_status: string | null;
  source: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notice_period_months: number | null;
  current_base: number | null;
  current_bonus: number | null;
  current_total: number | null;
  expected_total_min: number | null;
  expected_total_max: number | null;
  base_is_priority: boolean;
  base_minimum: number | null;
  bonus_preference: string | null;
  equity_open: boolean | null;
  presentation_notes: string | null;
  notes_presentation: string | null;
  notes_personality: string | null;
  notes_pitch: string | null;
  notes_closing: string | null;
  notes_internal: string | null;
  cv_url?: string | null;
  registration_form_url: string | null;
  ai_context: string | null;
  ai_context_updated_at: string | null;
  updated_at: string;
};

type Motivation = { id: string; rank: number; motivation_text: string; motivation_type: string | null };
type Blocker = { id: string; is_risk: boolean; theme: string; detail: string | null };
type Role = {
  id: string;
  company_name: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  achievement_notes: string | null;
  reason_for_leaving_raw: string | null;
};
type CompetingInterview = {
  id: string;
  company_name: string;
  source: string | null;
  stage: string | null;
  disclosed_at: string | null;
  is_active: boolean;
};
type Process = {
  id: string;
  stage: string;
  coverage_type: string;
  ai_snapshot: string | null;
  updated_at: string;
  buy_in_confirmed_at: string | null;
  cv_sent_at: string | null;
  placed_date: string | null;
  last_activity_at: string | null;
  requisitions: {
    id: string;
    title: string;
    salary_min: number | null;
    salary_max: number | null;
    salary_stretch: number | null;
    clients: { id: string; company_name: string } | null;
  } | null;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Parse ai_snapshot (JSON string) into NFAR point array. Falls back gracefully for old plain-text snapshots. */
function parsePositioningPoints(raw: string | null): Array<{ label: string; body: string }> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { points?: Array<{ label: string; body: string }> };
    if (Array.isArray(parsed.points) && parsed.points.length > 0) return parsed.points;
  } catch {
    // legacy plain-text snapshot — wrap as a single block so it still renders
    return [{ label: "Talking points", body: raw }];
  }
  return null;
}

// ─── data hook ────────────────────────────────────────────────────────────────

function useCandidateProfile(id: string) {
  return useQuery({
    queryKey: ["candidate-profile", id],
    queryFn: async () => {
      const [
        { data: candidate, error: cErr },
        { data: motivations },
        { data: blockers },
        { data: roles },
        { data: competing },
        { data: processes },
        { data: interactions },
      ] = await Promise.all([
        supabase
          .from("candidates")
          .select("*, notes_presentation, notes_personality, notes_pitch, notes_closing, notes_internal")
          .eq("id", id)
          .single(),
        supabase
          .from("candidate_motivations")
          .select("*")
          .eq("candidate_id", id)
          .order("rank"),
        supabase
          .from("candidate_blockers")
          .select("*")
          .eq("candidate_id", id),
        supabase
          .from("candidate_roles")
          .select("*")
          .eq("candidate_id", id)
          .order("start_date", { ascending: true }),
        supabase
          .from("competing_interviews")
          .select("*")
          .eq("candidate_id", id)
          .order("disclosed_at", { ascending: false }),
        supabase
          .from("processes")
          .select(
            `
            id, stage, coverage_type, ai_snapshot, updated_at,
            buy_in_confirmed_at, cv_sent_at, placed_date, last_activity_at,
            requisitions (
              id, title, salary_min, salary_max, salary_stretch,
              clients ( id, company_name )
            )
          `,
          )
          .eq("candidate_id", id)
          .not("stage", "in", '("Placed","Closed lost")')
          .order("updated_at", { ascending: false }),
        supabase
          .from("interactions")
          .select("id, interaction_type, summary, full_notes, interacted_at, client_id")
          .eq("candidate_id", id)
          .order("interacted_at", { ascending: false })
          .limit(50),
      ]);

      if (cErr) throw cErr;

      return {
        candidate: candidate as Candidate,
        motivations: (motivations ?? []) as Motivation[],
        blockers: (blockers ?? []) as Blocker[],
        roles: (roles ?? []) as Role[],
        competing: (competing ?? []) as CompetingInterview[],
        processes: (processes ?? []) as Process[],
        interactions: (interactions ?? []) as Array<{
          id: string;
          interaction_type: string;
          summary: string | null;
          full_notes: string | null;
          interacted_at: string;
          client_id: string | null;
        }>,
      };
    },
  });
}

// ─── component ───────────────────────────────────────────────────────────────

function CandidateProfile() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { data, isLoading } = useCandidateProfile(id);
  const [page, setPage] = useState<"registration" | "timeline" | "notes" | "processes">("registration");

  if (isLoading) {
    return (
      <div className="p-8 space-y-3 max-w-3xl">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-5 w-48" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-sm" style={{ color: "#888780" }}>
        Candidate not found.
      </div>
    );
  }

  const { candidate: c, motivations, blockers, roles, competing, processes, interactions } = data;
  const lastContact = relativeTime(c.updated_at);
  const daysAgo = daysSince(c.updated_at);

  return (
    <div className="px-8 py-6 max-w-3xl">
      {/* Profile header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-medium"
          style={{ background: "#e6f1fb", color: "#185fa5" }}
        >
          {initials(c.full_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-medium">
            {c.full_name}{" "}
            {c.full_name_japanese && (
              <span className="text-[14px] font-normal" style={{ color: "#5f5e5a" }}>
                {c.full_name_japanese}
              </span>
            )}
          </div>
          <div className="text-[12px]" style={{ color: "#5f5e5a" }}>
            {[c.current_title, c.current_company, c.age ? `Age ${c.age}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="text-right text-[11px]">
          Last contact:{" "}
          <span
            style={{ color: daysAgo > 14 ? "#a32d2d" : "#1a1a18", fontWeight: 500 }}
          >
            {lastContact}
          </span>
        </div>
      </div>

      {/* Page tabs */}
      <div
        className="flex mb-4"
        style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        {(
          [
            { key: "registration", label: "Registration" },
            { key: "timeline",     label: "Timeline" },
            { key: "notes",        label: "Candidate notes" },
            { key: "processes",    label: "Candidate intelligence" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className="px-4 py-2 text-[13px] transition-colors"
            style={{
              borderBottom: page === key ? "2px solid #1a1a18" : "2px solid transparent",
              color: page === key ? "#1a1a18" : "#5f5e5a",
              fontWeight: page === key ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Pages */}
      {page === "registration" && (
        <RegistrationPage
          candidateId={id}
          recruiterId={user!.id}
          candidate={c}
          motivations={motivations}
          blockers={blockers}
          roles={roles}
          competing={competing}
        />
      )}
      {page === "timeline" && (
        <CandidateTimelineTab
          candidateId={id}
          recruiterId={user!.id}
          interactions={interactions}
          processes={processes}
        />
      )}
      {page === "notes" && (
        <NotesTab candidateId={id} candidate={c} />
      )}
      {page === "processes" && (
        <ProcessesPage
          candidate={c}
          motivations={motivations}
          blockers={blockers}
          processes={processes}
          recruiterId={user!.id}
        />
      )}
    </div>
  );
}

// ─── registration page ────────────────────────────────────────────────────────

function RegistrationPage({
  candidateId,
  recruiterId,
  candidate: c,
  motivations,
  blockers,
  roles,
  competing,
}: {
  candidateId: string;
  recruiterId: string;
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  roles: Role[];
  competing: CompetingInterview[];
}) {
  type DialogType = "motivation" | "role" | "blocker" | "competing" | "presentation";
  const [openDialog, setOpenDialog] = useState<DialogType | null>(null);
  const close = () => setOpenDialog(null);
  const qc = useQueryClient();

  return (
    <div className="space-y-3">
      {/* CV Upload */}
      <CvUploadZone candidateId={candidateId} recruiterId={recruiterId} cvUrl={c.cv_url ?? null} />

      {/* Registration form upload */}
      <RegistrationFormUploadZone
        candidateId={candidateId}
        recruiterId={recruiterId}
        registrationFormUrl={c.registration_form_url}
      />

      {/* Status + Source row */}
      <Card>
        <SectionLabel>Status &amp; source</SectionLabel>
        <div className="grid grid-cols-2 gap-x-6">
          <FieldRow label="Candidate status">
            <CandidateStatusBadge status={c.candidate_status} />
          </FieldRow>
          <FieldRow label="Source">{c.source ?? "—"}</FieldRow>
          <FieldRow label="Active / Passive">{c.active_passive ?? "—"}</FieldRow>
          <FieldRow label="Urgency to move">
            <span style={{ color: c.urgency_to_move === "High" ? "#27500a" : c.urgency_to_move === "Low" ? "#888780" : "#1a1a18", fontWeight: c.urgency_to_move === "High" ? 500 : 400 }}>
              {c.urgency_to_move ?? "—"}
            </span>
          </FieldRow>
          <FieldRow label="Notice period">
            {c.notice_period_months ? `${c.notice_period_months} month${c.notice_period_months !== 1 ? "s" : ""}` : "—"}
          </FieldRow>
        </div>
      </Card>

      {/* Contact fields */}
      <Card>
        <SectionLabel>Contact information</SectionLabel>
        <FieldRow label="Email">{c.email ?? "—"}</FieldRow>
        <FieldRow label="Phone">{c.phone ?? "—"}</FieldRow>
        <FieldRow label="LinkedIn">{c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "#185fa5" }}>View profile</a> : "—"}</FieldRow>
      </Card>

      {/* Language */}
      <Card>
        <SectionLabel>Language ability</SectionLabel>
        <FieldRow label="Japanese"><strong>{c.japanese_level ?? "—"}</strong></FieldRow>
        <FieldRow label="English"><strong>{c.english_level ?? "—"}</strong></FieldRow>
        <FieldRow label="Other languages">{c.additional_languages ?? c.other_languages ?? "None"}</FieldRow>
      </Card>

      {/* Job history */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel className="mb-0">Job history</SectionLabel>
          <button className="ab" onClick={() => setOpenDialog("role")}>
            <IconPlus size={11} /> Add role
          </button>
        </div>
        {roles.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888780" }}>
            No roles added yet.
          </p>
        ) : (
          <div className="pl-1 mt-1">
            {roles.map((role, i) => (
              <RoleBlock key={role.id} role={role} isLast={i === roles.length - 1} />
            ))}
          </div>
        )}
      </Card>

      {/* Top 3 motivations */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel className="mb-0">Top 3 motivations — candidate-ranked</SectionLabel>
          <button
            className="ab"
            onClick={() => setOpenDialog("motivation")}
            disabled={motivations.length >= 3}
            title={motivations.length >= 3 ? "All 3 ranks are filled" : undefined}
          >
            <IconPlus size={11} /> Add
          </button>
        </div>
        {motivations.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888780" }}>
            No motivations recorded yet.
          </p>
        ) : (
          motivations.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] mb-1.5"
              style={{ background: "#f5f5f3", borderColor: "rgba(26,26,24,0.12)" }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                style={{ background: "#e6f1fb", color: "#185fa5" }}
              >
                {m.rank}
              </span>
              <span className="flex-1">{m.motivation_text}</span>
              {m.motivation_type && (
                <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "#e6f1fb", color: "#185fa5" }}>
                  {m.motivation_type.replace(/_/g, " ")}
                </span>
              )}
            </div>
          ))
        )}
        {motivations.length > 0 && (
          <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
            <IconInfoCircle size={12} />
            AI uses this ranking to sequence positioning talking points in each process tab
          </p>
        )}
      </Card>

      {/* Compensation */}
      <Card>
        <SectionLabel>Compensation</SectionLabel>
        <FieldRow label="Current base">{formatYen(c.current_base)}</FieldRow>
        <FieldRow label="Current bonus">
          {c.current_bonus ? `${formatYen(c.current_bonus)} annual performance` : "—"}
        </FieldRow>
        <FieldRow label="Current total">
          <strong>{formatYen(c.current_total)}</strong>
        </FieldRow>
        <div className="my-2 h-px" style={{ background: "rgba(26,26,24,0.12)" }} />
        <FieldRow label="Expected total">
          {c.expected_total_min || c.expected_total_max
            ? `${formatYen(c.expected_total_min)} – ${formatYen(c.expected_total_max)}`
            : "—"}
        </FieldRow>
        {c.base_is_priority && (
          <FieldRow label="⚠ Base priority" highlight="warning">
            <span style={{ color: "#633806" }}>
              {c.base_minimum
                ? `${formatYen(c.base_minimum)} base minimum — leads over total comp`
                : "Base stability matters more than total comp"}
            </span>
          </FieldRow>
        )}
        <div className="my-2 h-px" style={{ background: "rgba(26,26,24,0.12)" }} />
        <FieldRow label="Bonus preference">{c.bonus_preference ?? "—"}</FieldRow>
        <FieldRow label="Equity / RSU">
          {c.equity_open === true
            ? "Open if base floor is met"
            : c.equity_open === false
              ? "Not interested"
              : "—"}
        </FieldRow>
      </Card>

      {/* Personal blockers */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel className="mb-0">Personal blockers &amp; context</SectionLabel>
          <button className="ab" onClick={() => setOpenDialog("blocker")}>
            <IconPlus size={11} /> Add
          </button>
        </div>
        {blockers.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888780" }}>
            None recorded. Add family constraints, geographic limits, or other context.
          </p>
        ) : (
          [...blockers].sort((a, b) => (b.is_risk ? 1 : 0) - (a.is_risk ? 1 : 0)).map((b) => (
            <div key={b.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
              <span
                className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: b.is_risk ? "#633806" : "#888780" }}
              />
              <span>
                <strong>{b.theme}.</strong>{" "}
                <span style={{ color: b.is_risk ? "#1a1a18" : "#5f5e5a" }}>
                  {b.detail}
                </span>
              </span>
            </div>
          ))
        )}
      </Card>

      {/* Competing interviews */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel className="mb-0">
            Competing interviews &amp; applications — at registration
          </SectionLabel>
          <button className="ab" onClick={() => setOpenDialog("competing")}>
            <IconPlus size={11} /> Add
          </button>
        </div>
        {competing.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888780" }}>
            None recorded at registration.
          </p>
        ) : (
          <>
            {competing.map((ci) => (
              <div
                key={ci.id}
                className="flex items-center justify-between py-1.5 text-[13px]"
                style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)", opacity: ci.is_active ? 1 : 0.45 }}
              >
                <span className="font-medium" style={{ textDecoration: ci.is_active ? "none" : "line-through" }}>
                  {ci.company_name}
                </span>
                <div className="flex items-center gap-2">
                  {ci.source && <span style={{ color: "#5f5e5a", fontSize: 12 }}>{ci.source}</span>}
                  {ci.stage && (
                    <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "#f5f5f3", color: "#5f5e5a" }}>
                      {ci.stage}
                    </span>
                  )}
                  <button
                    className="text-[11px] px-2 py-0.5 rounded"
                    style={{ background: ci.is_active ? "#eaf3de" : "#f5f5f3", color: ci.is_active ? "#27500a" : "#888780", border: "0.5px solid rgba(26,26,24,0.12)" }}
                    onClick={() => {
                      void supabase.from("competing_interviews").update({ is_active: !ci.is_active }).eq("id", ci.id).then(() => {
                        void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
                      });
                    }}
                    title={ci.is_active ? "Mark as closed" : "Mark as active"}
                  >
                    {ci.is_active ? "Active" : "Closed"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

      {/* Presentation notes — lock icon, AI never touches */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <SectionLabel className="mb-0">
              Presentation &amp; communication — recruiter observation only
            </SectionLabel>
            <IconLock size={14} style={{ color: "#888780" }} />
          </div>
          <button className="ab" onClick={() => setOpenDialog("presentation")}>
            <IconPencil size={11} /> Edit
          </button>
        </div>
        <div
          className="rounded-lg p-3 text-[13px] leading-relaxed"
          style={{ background: "#f5f5f3" }}
        >
          {c.presentation_notes ? (
            c.presentation_notes
          ) : (
            <span style={{ color: "#888780" }}>
              No presentation notes yet. Add your observations after meeting this candidate.
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconLock size={12} />
          AI does not generate or modify this section — recruiter judgment only
        </p>
      </Card>

      {/* Dialogs */}
      <AddMotivationDialog
        candidateId={candidateId}
        existingRanks={motivations.map((m) => m.rank)}
        open={openDialog === "motivation"}
        onClose={close}
      />
      <AddRoleDialog
        candidateId={candidateId}
        open={openDialog === "role"}
        onClose={close}
      />
      <AddBlockerDialog
        candidateId={candidateId}
        open={openDialog === "blocker"}
        onClose={close}
      />
      <AddCompetingDialog
        candidateId={candidateId}
        open={openDialog === "competing"}
        onClose={close}
      />
      {/* Candidate intelligence card */}
      <CandidateIntelligenceCard
        candidateId={candidateId}
        aiContext={c.ai_context}
        aiContextUpdatedAt={c.ai_context_updated_at}
      />

      <EditPresentationNotesDialog
        candidateId={candidateId}
        currentNotes={c.presentation_notes}
        open={openDialog === "presentation"}
        onClose={close}
      />
    </div>
  );
}

// ─── add motivation dialog ────────────────────────────────────────────────────

function AddMotivationDialog({
  candidateId,
  existingRanks,
  open,
  onClose,
}: {
  candidateId: string;
  existingRanks: number[];
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rank, setRank] = useState("");
  const [text, setText] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidate_motivations").insert({
        candidate_id: candidateId,
        rank: Number(rank) as 1 | 2 | 3,
        motivation_text: text.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Motivation added");
      setRank("");
      setText("");
      onClose();
    },
    onError: (e: Error) => {
      if (e.message?.includes("unique")) {
        toast.error(`Rank ${rank} already has a motivation. Remove it first.`);
      } else {
        toast.error("Failed to add motivation");
      }
    },
  });

  const availableRanks = [1, 2, 3].filter((r) => !existingRanks.includes(r));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add motivation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Priority rank</Label>
            <Select value={rank} onValueChange={setRank}>
              <SelectTrigger>
                <SelectValue placeholder="Select rank…" />
              </SelectTrigger>
              <SelectContent>
                {availableRanks.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r === 1 ? "1 — Highest priority" : r === 2 ? "2 — Second priority" : "3 — Third priority"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Motivation</Label>
            <Textarea
              placeholder="e.g. Wants to move into a leadership role with direct reports"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <p className="text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
            <IconInfoCircle size={12} />
            AI will sequence positioning points using this order
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!rank || !text.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save motivation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── add role dialog ──────────────────────────────────────────────────────────

function AddRoleDialog({
  candidateId,
  open,
  onClose,
}: {
  candidateId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const empty = {
    company_name: "",
    title: "",
    is_current: false,
    start_date: "",
    end_date: "",
    achievement_notes: "",
    reason_for_leaving_raw: "",
  };
  const [form, setForm] = useState(empty);

  function set<K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidate_roles").insert({
        candidate_id: candidateId,
        company_name: form.company_name.trim(),
        title: form.title.trim() || null,
        is_current: form.is_current,
        start_date: form.start_date ? `${form.start_date}-01` : null,
        end_date: !form.is_current && form.end_date ? `${form.end_date}-01` : null,
        achievement_notes: form.achievement_notes.trim() || null,
        reason_for_leaving_raw: form.reason_for_leaving_raw.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Role added");
      setForm(empty);
      onClose();
    },
    onError: () => toast.error("Failed to add role"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company *</Label>
              <Input
                placeholder="e.g. Goldman Sachs"
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                placeholder="e.g. Vice President"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_current"
              checked={form.is_current}
              onChange={(e) => set("is_current", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="is_current" className="text-sm">
              Current role
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="month"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input
                type="month"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                disabled={form.is_current}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Key achievements</Label>
            <Textarea
              placeholder="Notable results, scope, or accomplishments in this role"
              value={form.achievement_notes}
              onChange={(e) => set("achievement_notes", e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Why they left / want to leave{" "}
              <span className="text-[11px] font-normal" style={{ color: "#a32d2d" }}>
                Internal only
              </span>
            </Label>
            <Textarea
              placeholder="Raw context for your eyes only — never shared with clients"
              value={form.reason_for_leaving_raw}
              onChange={(e) => set("reason_for_leaving_raw", e.target.value)}
              className="min-h-[70px]"
              style={{ background: form.reason_for_leaving_raw ? "#fcebeb" : undefined }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!form.company_name.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── add blocker dialog ───────────────────────────────────────────────────────

function AddBlockerDialog({
  candidateId,
  open,
  onClose,
}: {
  candidateId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [theme, setTheme] = useState("");
  const [detail, setDetail] = useState("");
  const [isRisk, setIsRisk] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidate_blockers").insert({
        candidate_id: candidateId,
        theme: theme.trim(),
        detail: detail.trim() || null,
        is_risk: isRisk === "risk",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Blocker added");
      setTheme("");
      setDetail("");
      setIsRisk("");
      onClose();
    },
    onError: () => toast.error("Failed to add blocker"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add blocker or context</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Theme *</Label>
            <Input
              placeholder="e.g. Geographic constraint, Family situation, Visa status"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Detail</Label>
            <Textarea
              placeholder="More context for this constraint…"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="min-h-[70px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={isRisk} onValueChange={setIsRisk}>
              <SelectTrigger>
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="risk">Risk — could block a placement</SelectItem>
                <SelectItem value="context">Context — useful background</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!theme.trim() || !isRisk || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── add competing interview dialog ──────────────────────────────────────────

function AddCompetingDialog({
  candidateId,
  open,
  onClose,
}: {
  candidateId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [company, setCompany] = useState("");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [disclosedAt, setDisclosedAt] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("competing_interviews").insert({
        candidate_id: candidateId,
        company_name: company.trim(),
        source: source.trim() || null,
        stage: stage.trim() || null,
        disclosed_at: disclosedAt || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Competing interview added");
      setCompany("");
      setSource("");
      setStage("");
      setDisclosedAt("");
      onClose();
    },
    onError: () => toast.error("Failed to add competing interview"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add competing interview</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Company *</Label>
            <Input
              placeholder="e.g. Morgan Stanley"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Input
                placeholder="LinkedIn, direct, agency…"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Input
                placeholder="e.g. Final round"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Date disclosed</Label>
            <Input
              type="date"
              value={disclosedAt}
              onChange={(e) => setDisclosedAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!company.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── edit presentation notes dialog ──────────────────────────────────────────

function EditPresentationNotesDialog({
  candidateId,
  currentNotes,
  open,
  onClose,
}: {
  candidateId: string;
  currentNotes: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(currentNotes ?? "");

  // Sync when dialog opens with fresh value
  const handleOpen = (v: boolean) => {
    if (v) setNotes(currentNotes ?? "");
    if (!v) onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("candidates")
        .update({ presentation_notes: notes.trim() || null })
        .eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Presentation notes updated");
      onClose();
    },
    onError: () => toast.error("Failed to update notes"),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconLock size={16} style={{ color: "#888780" }} />
            Presentation &amp; communication notes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Textarea
            placeholder="Your observations about how this candidate presents, communicates, and interviews. This feeds directly into the submission note's personality section."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[140px]"
          />
          <p className="text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
            <IconLock size={12} />
            AI does not generate, read, or modify this section — recruiter judgment only
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save notes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── role block (job history timeline) ───────────────────────────────────────

function RoleBlock({ role, isLast }: { role: Role; isLast: boolean }) {
  const startYear = role.start_date ? new Date(role.start_date).getFullYear() : null;
  const endYear = role.is_current
    ? "present"
    : role.end_date
      ? new Date(role.end_date).getFullYear()
      : null;

  let durationYears: number | null = null;
  if (role.start_date) {
    const end = role.is_current
      ? new Date()
      : role.end_date
        ? new Date(role.end_date)
        : null;
    if (end) {
      durationYears = Math.round(
        (end.getTime() - new Date(role.start_date).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      );
    }
  }

  return (
    <div className="relative pl-5 mb-4">
      {/* Timeline line */}
      {!isLast && (
        <div
          className="absolute left-[4px] top-[14px] bottom-[-16px] w-px"
          style={{ background: "rgba(26,26,24,0.22)" }}
        />
      )}
      {/* Dot */}
      <div
        className="absolute left-0 top-[6px] h-[9px] w-[9px] rounded-full border-[1.5px]"
        style={
          role.is_current
            ? { background: "#eaf3de", borderColor: "rgba(39,80,10,0.25)" }
            : { background: "#e6f1fb", borderColor: "rgba(24,95,165,0.3)" }
        }
      />

      {/* Content */}
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[14px] font-medium">{role.company_name}</span>
        <span className="text-[12px]" style={{ color: "#5f5e5a" }}>
          {startYear && endYear ? `${startYear} – ${endYear}` : ""}
          {durationYears ? ` · ${durationYears} year${durationYears !== 1 ? "s" : ""}` : ""}
        </span>
      </div>
      <div className="text-[12px] mb-2" style={{ color: "#5f5e5a" }}>
        {role.title}
        {role.is_current && (
          <span
            className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "#eaf3de", color: "#27500a" }}
          >
            Current
          </span>
        )}
      </div>

      {role.achievement_notes && (
        <div
          className="rounded-lg p-2.5 text-[13px] leading-relaxed mb-2"
          style={{ background: "#f5f5f3" }}
        >
          {role.achievement_notes}
        </div>
      )}

      {role.reason_for_leaving_raw && (
        <>
          <p className="sl mb-1">Why {role.is_current ? "they want to leave" : "they left"}</p>
          {role.is_current && (
            <p className="text-[11px] mb-1" style={{ color: "#a32d2d" }}>
              Internal — not for client use
            </p>
          )}
          <div
            className="rounded-lg p-2.5 text-[13px] leading-relaxed"
            style={{
              background: role.is_current ? "#fcebeb" : "#f5f5f3",
            }}
          >
            {role.reason_for_leaving_raw}
          </div>
        </>
      )}
    </div>
  );
}

// ─── notes tab ────────────────────────────────────────────────────────────────

/**
 * Individual autosaving note section.
 * Saves to the candidates table on blur, only when the value has changed.
 */
function NoteSection({
  label,
  helper,
  fieldKey,
  candidateId,
  initialValue,
  placeholder,
  minHeight = 100,
  isInternal = false,
}: {
  label: string;
  helper: string;
  fieldKey: string;
  candidateId: string;
  initialValue: string | null;
  placeholder?: string;
  minHeight?: number;
  isInternal?: boolean;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedValueRef = useRef(initialValue ?? "");

  async function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === savedValueRef.current.trim()) return; // nothing changed
    setSaving(true);
    type NotesUpdate = {
      notes_presentation?: string | null;
      notes_personality?: string | null;
      notes_pitch?: string | null;
      notes_closing?: string | null;
      notes_internal?: string | null;
    };
    const { error } = await supabase
      .from("candidates")
      .update({ [fieldKey]: trimmed || null } as NotesUpdate)
      .eq("id", candidateId);
    setSaving(false);
    if (!error) {
      savedValueRef.current = trimmed;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
    }
  }

  const isFilled = value.trim().length > 0;

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <SectionLabel className="mb-0">{label}</SectionLabel>
            {isInternal && <IconLock size={13} style={{ color: "#888780" }} />}
          </div>
          {saving && (
            <span className="text-[11px]" style={{ color: "#888780" }}>Saving…</span>
          )}
          {saved && !saving && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: "#27500a" }}>
              <IconCheck size={11} /> Saved
            </span>
          )}
        </div>
      )}
      {helper && (
        <p className="text-[12px] mb-2 leading-relaxed" style={{ color: "#888780" }}>
          {helper}
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full rounded-lg p-3 text-[13px] leading-relaxed resize-none outline-none"
        style={{
          background: isInternal && isFilled ? "#fcebeb" : "#f5f5f3",
          border: "0.5px solid rgba(26,26,24,0.12)",
          minHeight,
          fontFamily: "inherit",
          transition: "background 0.15s",
        }}
        onFocus={(e) => {
          (e.target as HTMLTextAreaElement).style.outline = "none";
          (e.target as HTMLTextAreaElement).style.boxShadow = "0 0 0 1.5px rgba(24,95,165,0.25)";
        }}
        onBlurCapture={(e) => {
          (e.target as HTMLTextAreaElement).style.boxShadow = "none";
        }}
      />
    </div>
  );
}

function NotesTab({
  candidateId,
  candidate: c,
}: {
  candidateId: string;
  candidate: Candidate;
}) {
  return (
    <div className="space-y-3 pb-8">
      {/* Section 1 — Presentation & Communication */}
      <Card>
        <NoteSection
          label="Presentation &amp; communication"
          helper="How they come across in person or on a call — confidence, pace, clarity, switching between languages. Notable strengths or gaps a recruiter should know before presenting them."
          fieldKey="notes_presentation"
          candidateId={candidateId}
          initialValue={c.notes_presentation}
          placeholder="e.g. Very measured speaker — takes a moment before answering, which plays well in senior interviews. Japanese is natural and unforced. English is confident but slightly formal in writing."
          minHeight={110}
        />
        <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconInfoCircle size={12} />
          AI uses this for: email pitch, call scripts, submission note personality section
        </p>
      </Card>

      {/* Section 2 — Personality & Working Style */}
      <Card>
        <NoteSection
          label="Personality &amp; working style"
          helper="What kind of environment and manager brings out their best. How they handle pressure or ambiguity. What motivates them beyond their formally stated reasons. Patterns you noticed from how they answered questions."
          fieldKey="notes_personality"
          candidateId={candidateId}
          initialValue={c.notes_personality}
          placeholder="e.g. Strong executor who gets frustrated when process slows things down. Works best with direct managers who give clear direction then step back. Asks good questions — intellectually curious. Gets energised by owning a problem end-to-end."
          minHeight={110}
        />
        <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconInfoCircle size={12} />
          AI uses this for: pre-call briefing, coaching guidance
        </p>
      </Card>

      {/* Section 3 — Pitch Notes for Client */}
      <Card>
        <NoteSection
          label="Pitch notes — for client"
          helper="The 2–3 strongest selling points to lead with when presenting this candidate to a hiring manager. Specific proof points and standout moments. What makes them genuinely rare in the Japan bilingual market."
          fieldKey="notes_pitch"
          candidateId={candidateId}
          initialValue={c.notes_pitch}
          placeholder="e.g. Led the Japan launch of a SaaS product from 0 to ¥200M ARR in 18 months with a team of 3. Only bilingual Sales Engineer in a company of 400. Strong internal reputation — was asked to run the APAC pilot despite being the youngest team lead."
          minHeight={110}
        />
        <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconInfoCircle size={12} />
          AI uses this for: submission note key recommendation points, strategic fit section
        </p>
      </Card>

      {/* Section 4 — Closing Intelligence */}
      <Card>
        <NoteSection
          label="Closing intelligence"
          helper="What will close this candidate — and what won't. Family dynamics (spouse, parents) and how they factor in. Risk tolerance. Counteroffer vulnerability. What they need to see to say yes. What will make them hesitate at the last moment."
          fieldKey="notes_closing"
          candidateId={candidateId}
          initialValue={c.notes_closing}
          placeholder="e.g. Wife is cautious about stability — needs to feel the new company is established in Japan. Father worked at Toyota for 30 years. Very unlikely to counteroffer if base clears ¥12M — they've already emotionally moved on. Give them a deadline. Don't chase."
          minHeight={130}
        />
        <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconInfoCircle size={12} />
          AI uses this for: closing script, counteroffer prep, resignation prep
        </p>
      </Card>

      {/* Section 5 — Internal Notes */}
      <Card>
        <NoteSection
          label="Internal notes"
          helper="Recruiter concerns, patterns, or context for your own reference. This section is never included in any AI output or client-facing communication."
          fieldKey="notes_internal"
          candidateId={candidateId}
          initialValue={c.notes_internal}
          placeholder="e.g. Has cancelled two meetings with short notice. May be less active than they've stated. Worth testing commitment before investing time on full submission."
          minHeight={100}
          isInternal
        />
        <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconLock size={12} />
          AI does not read or use this section — internal recruiter reference only
        </p>
      </Card>
    </div>
  );
}

// ─── processes page ───────────────────────────────────────────────────────────

function ProcessesPage({
  candidate: c,
  motivations,
  blockers,
  processes,
  recruiterId,
}: {
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  processes: Process[];
  recruiterId: string;
}) {
  const [activeProcessId, setActiveProcessId] = useState<string | null>(
    processes[0]?.id ?? null,
  );
  const [addProcessOpen, setAddProcessOpen] = useState(false);

  const activeProcess = processes.find((p) => p.id === activeProcessId) ?? null;

  if (processes.length === 0) {
    return (
      <>
        <div className="py-10 text-center">
          <p className="text-sm font-medium">No active processes.</p>
          <p className="mt-1 text-[13px]" style={{ color: "#5f5e5a" }}>
            Add this candidate to an open requisition to start tracking the process.
          </p>
          <button
            className="mt-4 ab mx-auto flex items-center gap-1"
            onClick={() => setAddProcessOpen(true)}
          >
            <IconPlus size={11} /> Add to process
          </button>
        </div>
        <AddToProcessModal
          open={addProcessOpen}
          onClose={() => setAddProcessOpen(false)}
          candidateId={c.id}
          candidateName={c.full_name}
          recruiterId={recruiterId}
          existingReqIds={[]}
        />
      </>
    );
  }

  const existingReqIds = processes
    .map((p) => p.requisitions?.id)
    .filter((id): id is string => !!id);

  return (
    <div>
      {/* Legend + Add button row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap text-[11px]" style={{ color: "#5f5e5a" }}>
          <TabLegend color="#c0dd97" border="#3B6D11" label="Your req" />
          <TabLegend color="#d3d1c7" border="#888780" label="Colleague's req" />
          <TabLegend color="#f7c1c1" border="#a32d2d" label="Not covered by your firm" />
          <StageBadge stage="CCM1" className="text-[10px] py-0" />
          <StageBadge stage="Buy-In" className="text-[10px] py-0" />
          <StageBadge stage="Offer" className="text-[10px] py-0" />
        </div>
        <button
          className="ab flex items-center gap-1 shrink-0 ml-2"
          onClick={() => setAddProcessOpen(true)}
        >
          <IconPlus size={11} /> Add to process
        </button>
      </div>

      {/* Binder tabs — overflow-x scroll; never wrap to second row */}
      <div
        className="flex items-end gap-[3px]"
        style={{ marginBottom: -1, position: "relative", zIndex: 2, overflowX: "auto" }}
      >
        {processes.map((p) => {
          const req = p.requisitions;
          const clientName = req?.clients?.company_name ?? "Unknown";
          const tabClass =
            p.coverage_type === "own"
              ? "tab-own"
              : p.coverage_type === "colleague"
                ? "tab-colleague"
                : "tab-uncovered";

          return (
            <button
              key={p.id}
              onClick={() => setActiveProcessId(p.id)}
              className={`process-tab ${tabClass} ${
                p.id === activeProcessId ? "" : "inactive"
              }`}
            >
              {clientName}
              <StageBadge stage={p.stage} className="text-[10px] py-0 px-1.5" />
            </button>
          );
        })}
      </div>

      <AddToProcessModal
        open={addProcessOpen}
        onClose={() => setAddProcessOpen(false)}
        candidateId={c.id}
        candidateName={c.full_name}
        recruiterId={recruiterId}
        existingReqIds={existingReqIds}
        onAdded={(newProcessId) => setActiveProcessId(newProcessId)}
      />

      {/* Panel */}
      {activeProcess && (
        <ProcessPanel
          process={activeProcess}
          candidate={c}
          motivations={motivations}
          blockers={blockers}
          recruiterId={recruiterId}
        />
      )}

      {/* Compensation card at bottom */}
      <div className="mt-3">
        <Card>
          <SectionLabel>Compensation</SectionLabel>
          <FieldRow label="Current">
            {formatYen(c.current_total)} total
            {c.current_base ? ` (Base ${formatYen(c.current_base)}` : ""}
            {c.current_bonus ? ` + Bonus ${formatYen(c.current_bonus)})` : c.current_base ? ")" : ""}
          </FieldRow>
          <FieldRow label="Expected">
            {c.expected_total_min || c.expected_total_max
              ? `${formatYen(c.expected_total_min)} – ${formatYen(c.expected_total_max)} total`
              : "—"}
          </FieldRow>
          {c.base_is_priority && (
            <FieldRow label="⚠ Base priority" highlight="warning">
              <span style={{ color: "#633806" }}>
                {c.base_minimum
                  ? `${formatYen(c.base_minimum)} base minimum — total comp is secondary`
                  : "Base stability matters more than total"}
              </span>
            </FieldRow>
          )}
        </Card>
      </div>
    </div>
  );
}

function TabLegend({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ background: color, border: `0.5px solid ${border}` }}
      />
      {label}
    </span>
  );
}

// ─── process panel (white regardless of tab color) ───────────────────────────

const PIPELINE_STAGES = [
  "Specs Sent", "Buy-In", "CV Sent", "CCM1", "CCM2", "CCM3", "CCM4",
  "Offer", "Placed", "Closed lost",
] as const;

function useStageChange(candidateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ process, newStage }: { process: Process; newStage: string }) => {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      type ProcessPatch = {
        stage: string;
        last_activity_at: string;
        buy_in_confirmed_at?: string;
        cv_sent_at?: string;
        placed_date?: string;
      };
      const patch: ProcessPatch = { stage: newStage, last_activity_at: now };

      if (newStage === "Buy-In" && !process.buy_in_confirmed_at) patch.buy_in_confirmed_at = now;
      if (newStage === "CV Sent" && !process.cv_sent_at) patch.cv_sent_at = now;
      if (newStage === "Placed") patch.placed_date = today;

      const { error } = await supabase.from("processes").update(patch).eq("id", process.id);
      if (error) throw error;

      if (newStage === "Placed") {
        const guarantee = new Date();
        guarantee.setDate(guarantee.getDate() + 90);
        await supabase.from("candidates").update({
          candidate_status: "placed",
          placement_guarantee_until: guarantee.toISOString().slice(0, 10),
        }).eq("id", candidateId);
      }
    },
    onSuccess: (_, { newStage }) => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success(`Stage updated to ${newStage}.`);
    },
    onError: () => toast.error("Could not update stage. Try again."),
  });
}

function ProcessPanel({
  process: p,
  candidate: c,
  motivations,
  blockers,
  recruiterId,
}: {
  process: Process;
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  recruiterId: string;
}) {
  const req = p.requisitions;
  const clientName = req?.clients?.company_name ?? "Unknown";
  const stageChange = useStageChange(c.id);

  return (
    <div
      className="rounded-b-xl rounded-tr-xl p-5"
      style={{
        background: "#ffffff",
        border: "0.5px solid rgba(26,26,24,0.12)",
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between mb-4 pb-2.5 text-[12px]"
        style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)", color: "#5f5e5a" }}
      >
        <span className="flex items-center gap-1.5">
          <IconBuilding size={14} />
          {clientName} — {req?.title ?? "—"} ·{" "}
          {p.coverage_type === "own"
            ? "Your req"
            : p.coverage_type === "colleague"
              ? "Colleague's req"
              : "Not covered by your firm"}
        </span>
        <select
          value={p.stage}
          disabled={stageChange.isPending}
          onChange={(e) => {
            const newStage = e.target.value;
            if (newStage !== p.stage) stageChange.mutate({ process: p, newStage });
          }}
          className="text-[11px] font-medium rounded px-2 py-0.5 outline-none cursor-pointer"
          style={{ border: "0.5px solid rgba(26,26,24,0.16)", color: "#1a1a18", background: "#f5f5f3" }}
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {p.stage === "Buy-In" ? (
        <BuyInPanel process={p} candidate={c} motivations={motivations} blockers={blockers} recruiterId={recruiterId} />
      ) : p.stage === "Offer" ? (
        <OfferPanel process={p} candidate={c} />
      ) : (
        <InterviewPanel process={p} candidate={c} motivations={motivations} blockers={blockers} recruiterId={recruiterId} />
      )}
    </div>
  );
}

// ─── interview panel ──────────────────────────────────────────────────────────

function InterviewPanel({
  process: p,
  candidate: c,
  motivations,
  blockers,
  recruiterId,
}: {
  process: Process;
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  recruiterId: string;
}) {
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingPositioning, setLoadingPositioning] = useState(false);
  const [positioning, setPositioning] = useState<string | null>(p.ai_snapshot);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [submissionPackage, setSubmissionPackage] = useState<import("@/integrations/supabase/types").SubmissionPackage | null>(null);

  async function generatePositioning() {
    setLoadingPositioning(true);
    try {
      const resp = await fetch("/api/ai/positioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: p.id, candidateId: c.id, recruiterId }),
      });
      const json = await resp.json() as { points?: Array<{ label: string; body: string }>; error?: string };
      if (json.points) setPositioning(JSON.stringify({ points: json.points }));
    } finally {
      setLoadingPositioning(false);
    }
  }

  async function generateBriefing() {
    setLoadingBriefing(true);
    try {
      const resp = await fetch("/api/ai/pre-call-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: c.id, recruiterId }),
      });
      const json = await resp.json() as { content?: string; error?: string };
      if (json.content) setBriefing(json.content);
    } finally {
      setLoadingBriefing(false);
    }
  }

  async function generateSubmissionNote() {
    if (!p.requisitions?.id) { toast.error("No requisition linked to this process."); return; }
    setLoadingSubmission(true);
    try {
      const resp = await fetch("/api/ai/submission-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: c.id,
          requisition_id: p.requisitions.id,
          process_id: p.id,
        }),
      });
      const json = await resp.json() as import("@/integrations/supabase/types").SubmissionPackage & { error?: string };
      if (json.error) { toast.error("Could not generate submission package. Try again."); return; }
      setSubmissionPackage(json);
    } finally {
      setLoadingSubmission(false);
    }
  }

  const watchOuts = blockers.filter((b) => b.is_risk);

  return (
    <div>
      {/* Two-column: motivations + watch-outs */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <SectionLabel>Top motivations for this role</SectionLabel>
          {motivations.length === 0 ? (
            <p className="text-[13px]" style={{ color: "#888780" }}>No motivations recorded.</p>
          ) : (
            motivations.map((m) => (
              <div key={m.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span
                  className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: "#888780" }}
                />
                <span>{m.motivation_text}</span>
              </div>
            ))
          )}
        </div>

        <div>
          <SectionLabel>Watch out for</SectionLabel>
          {watchOuts.length === 0 ? (
            <p className="text-[13px]" style={{ color: "#888780" }}>No risk flags recorded.</p>
          ) : (
            watchOuts.map((b) => (
              <div key={b.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span
                  className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: "#633806" }}
                />
                <span>
                  <strong>{b.theme}.</strong>{" "}
                  <span style={{ color: "#5f5e5a" }}>{b.detail}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Positioning talking points — NFAR blocks */}
      <SectionLabel>Positioning talking points</SectionLabel>
      {(() => {
        const pts = parsePositioningPoints(positioning);
        if (pts) {
          return (
            <div className="mb-3">
              {pts.map((pt, i) => (
                <div key={i} className="nfar">
                  <p className="nfar-obj">{pt.label}</p>
                  <p className="nfar-txt">{pt.body}</p>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div
            className="rounded-lg p-3 text-[13px] mb-3"
            style={{ background: "#f5f5f3", border: "0.5px dashed rgba(26,26,24,0.22)" }}
          >
            <span style={{ color: "#888780" }}>No positioning points yet. </span>
            <button
              onClick={generatePositioning}
              disabled={loadingPositioning}
              className="underline underline-offset-2"
              style={{ color: "#185fa5" }}
            >
              {loadingPositioning ? "Generating…" : "Generate with AI"}
            </button>
          </div>
        );
      })()}

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap mt-2">
        <button className="ab" onClick={generateBriefing} disabled={loadingBriefing}>
          <IconPhone size={12} />
          {loadingBriefing ? "Generating…" : "Pre-call briefing"}
        </button>
        <button className="ab" onClick={generateSubmissionNote} disabled={loadingSubmission}>
          <IconFileText size={12} />
          {loadingSubmission ? "Generating…" : "Submission note"}
        </button>
        <button className="ab" onClick={generatePositioning} disabled={loadingPositioning}>
          <IconSparkles size={12} />
          Refresh talking points
        </button>
      </div>

      {/* Pre-call briefing output */}
      {briefing && (
        <div
          className="mt-4 rounded-lg p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
          style={{
            background: "#e6f1fb",
            border: "0.5px solid rgba(24,95,165,0.3)",
          }}
        >
          <p className="sl mb-2" style={{ color: "#185fa5" }}>Pre-call briefing</p>
          {briefing}
        </div>
      )}

      {/* Submission package output */}
      {submissionPackage && (
        <SubmissionPackagePanel
          pkg={submissionPackage}
          candidateName={c.full_name}
          onClose={() => setSubmissionPackage(null)}
        />
      )}
    </div>
  );
}

// ─── buy-in panel ─────────────────────────────────────────────────────────────

function BuyInPanel({
  process: p,
  candidate: c,
  motivations,
  blockers,
  recruiterId,
}: {
  process: Process;
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  recruiterId: string;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [loadingPositioning, setLoadingPositioning] = useState(false);
  const [positioning, setPositioning] = useState<string | null>(p.ai_snapshot);

  const watchOuts = blockers.filter((b) => b.is_risk);

  async function generatePositioning() {
    setLoadingPositioning(true);
    try {
      const resp = await fetch("/api/ai/positioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: p.id, candidateId: c.id, recruiterId }),
      });
      const json = await resp.json() as { points?: Array<{ label: string; body: string }>; error?: string };
      if (json.points) setPositioning(JSON.stringify({ points: json.points }));
    } finally {
      setLoadingPositioning(false);
    }
  }

  const clientName = p.requisitions?.clients?.company_name ?? "this company";
  const reqTitle = p.requisitions?.title ?? "the role";

  const emailPitch = `Subject: ${reqTitle} — ${clientName}

Opening:
Quick note, [Candidate Name]. I have a role that maps closely to what you told me matters most — and I want to share it before anything else gets in the way.

The role:
${clientName} is hiring for a ${reqTitle}. The base range clears your floor without a fight, and the scope aligns to your #1 motivation: ${motivations[0]?.motivation_text ?? "[top motivation]"}.

Why consider now:
${motivations[1]?.motivation_text ? `It also addresses: ${motivations[1].motivation_text}.` : "The timing is good — they are moving quickly."}

Close:
Worth 15 minutes to hear more? I can walk you through the full picture. No obligation to proceed.

[Recruiter signature]

---
Attachment reminder: Attach the JD PDF before sending.`;

  const callScript = `Opening:
[Candidate Name], I will keep this brief — I have something worth a quick look and I want to give you first visibility.

The hook:
${clientName} is hiring for a ${reqTitle}. Base range clears your number, and the role directly maps to [${motivations[0]?.motivation_text ?? "their top motivation"}].

Handle objections:
"Already in other processes" — That is exactly the right time. One more well-matched option only improves your position at the final decision.
"Not looking actively" — You told me [context from registration]. This one is worth 10 minutes.

Close for buy-in:
I am not asking you to commit. I am asking: would you be comfortable if I shared your profile with them? I will send the JD now and we talk after you have read it.`;

  return (
    <div>
      <p className="text-[13px] mb-3" style={{ color: "#5f5e5a" }}>
        Not yet approached. Goal is to get buy-in to submit the profile to the client.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <SectionLabel>Why this could interest them</SectionLabel>
          {motivations.length === 0 ? (
            <p className="text-[13px]" style={{ color: "#888780" }}>No motivations recorded.</p>
          ) : (
            motivations.map((m) => (
              <div key={m.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span
                  className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: "#888780" }}
                />
                <span>{m.motivation_text}</span>
              </div>
            ))
          )}
        </div>
        <div>
          <SectionLabel>Anticipate these objections</SectionLabel>
          {watchOuts.length > 0 ? (
            watchOuts.map((b) => (
              <div key={b.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#633806" }} />
                <span><strong>{b.theme}.</strong>{" "}<span style={{ color: "#5f5e5a" }}>{b.detail}</span></span>
              </div>
            ))
          ) : (
            <>
              <div className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#633806" }} />
                <span>Already in other processes — lead with optionality, not competition.</span>
              </div>
              <div className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#888780" }} />
                <span>Not actively looking — frame as a low-commitment information share.</span>
              </div>
            </>
          )}
        </div>
      </div>

      <SectionLabel>Outreach</SectionLabel>
      <div className="flex gap-2 mb-4">
        <button
          className="ab"
          style={{ fontSize: 12, padding: "6px 14px" }}
          onClick={() => setShowEmail(!showEmail)}
        >
          <IconMail size={13} />
          Email candidate pitch
        </button>
        <button
          className="ab"
          style={{ fontSize: 12, padding: "6px 14px" }}
          onClick={() => setShowCall(!showCall)}
        >
          <IconPhone size={13} />
          Call pitch script
        </button>
      </div>

      {showEmail && (
        <div
          className="rounded-lg p-4 mb-3 text-[13px] font-mono whitespace-pre-wrap leading-relaxed"
          style={{
            background: "#f5f5f3",
            border: "0.5px solid rgba(26,26,24,0.22)",
          }}
        >
          {emailPitch}
        </div>
      )}

      {showCall && (
        <div
          className="rounded-lg p-4 mb-3 text-[13px] whitespace-pre-wrap leading-relaxed"
          style={{
            background: "#f5f5f3",
            border: "0.5px solid rgba(26,26,24,0.22)",
          }}
        >
          {callScript}
        </div>
      )}

      {/* Positioning talking points — NFAR blocks */}
      <div className="mt-1">
        <SectionLabel>Positioning talking points</SectionLabel>
        {(() => {
          const pts = parsePositioningPoints(positioning);
          if (pts) {
            return (
              <div>
                {pts.map((pt, i) => (
                  <div key={i} className="nfar">
                    <p className="nfar-obj">{pt.label}</p>
                    <p className="nfar-txt">{pt.body}</p>
                  </div>
                ))}
                <button className="ab mt-1" onClick={generatePositioning} disabled={loadingPositioning}>
                  <IconSparkles size={11} />
                  {loadingPositioning ? "Refreshing…" : "Refresh talking points"}
                </button>
              </div>
            );
          }
          return (
            <div
              className="rounded-lg p-3 text-[13px]"
              style={{ background: "#f5f5f3", border: "0.5px dashed rgba(26,26,24,0.22)" }}
            >
              <span style={{ color: "#888780" }}>No positioning points yet. </span>
              <button
                onClick={generatePositioning}
                disabled={loadingPositioning}
                className="underline underline-offset-2"
                style={{ color: "#185fa5" }}
              >
                {loadingPositioning ? "Generating…" : "Generate with AI"}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── offer panel ──────────────────────────────────────────────────────────────

function OfferPanel({
  process: p,
  candidate: c,
}: {
  process: Process;
  candidate: Candidate;
}) {
  const req = p.requisitions;

  return (
    <div>
      {/* Offer details card */}
      {req && (
        <div
          className="rounded-lg p-3 px-4 mb-4"
          style={{ background: "#f5f5f3" }}
        >
          <div className="flex justify-between text-[13px] py-1.5" style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)" }}>
            <span style={{ color: "#5f5e5a" }}>Offer range</span>
            <span>
              {req.salary_min || req.salary_max
                ? `${formatYen(req.salary_min)} – ${formatYen(req.salary_max)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between text-[13px] py-1.5" style={{ borderBottom: "0.5px solid rgba(26,26,24,0.12)" }}>
            <span style={{ color: "#5f5e5a" }}>vs candidate floor</span>
            <span>
              {req.salary_min && c.base_minimum ? (
                req.salary_min >= c.base_minimum ? (
                  <span style={{ color: "#27500a", fontWeight: 500 }}>
                    ✓ Above {formatYen(c.base_minimum)} base minimum
                  </span>
                ) : (
                  <span style={{ color: "#a32d2d", fontWeight: 500 }}>
                    ✗ Below {formatYen(c.base_minimum)} base minimum
                  </span>
                )
              ) : (
                <span style={{ color: "#888780" }}>Base minimum not recorded</span>
              )}
            </span>
          </div>
          {req.salary_stretch && (
            <div className="flex justify-between text-[13px] py-1.5">
              <span style={{ color: "#5f5e5a" }}>Stretch available</span>
              <span>Up to {formatYen(req.salary_stretch)}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Closing risks */}
        <div>
          <SectionLabel>Closing risks</SectionLabel>
          <div className="flex gap-2 mb-1.5 text-[13px]">
            <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#633806" }} />
            <span><strong>Pre-close check.</strong> Have you confirmed what they need to say yes?</span>
          </div>
          <div className="flex gap-2 mb-1.5 text-[13px]">
            <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#633806" }} />
            <span><strong>Sony counteroffer.</strong> Prepare them before they resign.</span>
          </div>
          <div className="flex gap-2 mb-1.5 text-[13px]">
            <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#633806" }} />
            <span><strong>Family loop.</strong> Has everyone in the decision been informed?</span>
          </div>
        </div>

        {/* Counteroffer defense */}
        <div>
          <SectionLabel>Counteroffer defense</SectionLabel>
          <div
            className="rounded-lg p-3 text-[13px] leading-relaxed mb-2"
            style={{ background: "#f5f5f3", borderLeft: "2px solid rgba(24,95,165,0.3)" }}
          >
            Ask yourself — why did it take a resignation letter to get this? The reasons you decided to move are still there on Monday morning.
          </div>
          <p className="text-[11px]" style={{ color: "#888780" }}>
            Statistics: 60–80% who accept a counteroffer leave within 6 months. 90% within 12 months.
          </p>
        </div>
      </div>

      {/* Resignation prep */}
      <SectionLabel>Resignation prep talking points</SectionLabel>
      <div
        className="rounded-lg p-3 text-[13px] leading-relaxed mb-3"
        style={{ background: "#f5f5f3", borderLeft: "2px solid rgba(24,95,165,0.3)" }}
      >
        <p className="mb-2">Keep it short and professional. You do not owe a full explanation.</p>
        <p className="mb-2">Thank your manager for the experience. Say you have accepted a role that aligns better with where you want to go next.</p>
        <p>If they ask what it would take to stay — tell them you have made your decision and you are committed to a smooth handover.</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap mt-2">
        <button className="ab">
          <IconPhone size={12} />
          Closing script
        </button>
        <button className="ab">
          <IconShield size={12} />
          Counteroffer prep
        </button>
        <button className="ab">
          <IconMessage size={12} />
          Resignation prep
        </button>
        <button className="ab">
          <IconBolt size={12} />
          Accelerate other processes
        </button>
        <button className="ab">
          <IconCurrencyYen size={12} />
          Negotiate offer
        </button>
      </div>
    </div>
  );
}

// ─── add to process modal ─────────────────────────────────────────────────────

type OpenReq = {
  id: string;
  title: string;
  salary_min: number | null;
  salary_max: number | null;
  clients: { id: string; company_name: string } | null;
};

function AddToProcessModal({
  open,
  onClose,
  candidateId,
  candidateName,
  recruiterId,
  existingReqIds,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  recruiterId: string;
  existingReqIds: string[];
  onAdded?: (newProcessId: string) => void;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: reqs = [], isLoading } = useQuery({
    queryKey: ["open-reqs-for-process", recruiterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("requisitions")
        .select("id, title, salary_min, salary_max, clients(id, company_name)")
        .eq("recruiter_id", recruiterId)
        .eq("is_open", true)
        .order("created_at", { ascending: false });
      return (data ?? []) as OpenReq[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Group by client
  const grouped = reqs.reduce<Record<string, { clientName: string; reqs: OpenReq[] }>>(
    (acc, r) => {
      const clientId = r.clients?.id ?? "unknown";
      const clientName = r.clients?.company_name ?? "Unknown client";
      if (!acc[clientId]) acc[clientId] = { clientName, reqs: [] };
      acc[clientId].reqs.push(r);
      return acc;
    },
    {},
  );

  async function handleAdd(req: OpenReq) {
    setSaving(req.id);
    try {
      const { data, error } = await supabase
        .from("processes")
        .insert({
          candidate_id: candidateId,
          requisition_id: req.id,
          owner_recruiter_id: recruiterId,
          stage: "Specs Sent" as const,
          coverage_type: "own" as const,
        })
        .select("id")
        .single();
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      void qc.invalidateQueries({ queryKey: ["open-reqs-for-process", recruiterId] });
      toast.success(`${candidateName} added to ${req.clients?.company_name ?? "process"} — ${req.title}`);
      if (data?.id) onAdded?.(data.id);
      onClose();
    } catch {
      toast.error("Failed to add process — check for duplicates");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ maxWidth: 440 }}>
        <DialogHeader>
          <DialogTitle>Add {candidateName} to a process</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] -mx-1 px-1">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-[8px]"
                  style={{ background: "#f5f5f3" }}
                />
              ))}
            </div>
          ) : reqs.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: "#888780" }}>
              No open requisitions. Add one from a client account first.
            </p>
          ) : (
            <div className="space-y-4 py-1">
              {Object.values(grouped).map(({ clientName, reqs: clientReqs }) => (
                <div key={clientName}>
                  <p
                    className="text-[11px] font-medium uppercase mb-1.5"
                    style={{ color: "#888780", letterSpacing: "0.04em" }}
                  >
                    {clientName}
                  </p>
                  <div className="space-y-1">
                    {clientReqs.map((r) => {
                      const alreadyAdded = existingReqIds.includes(r.id);
                      const isSaving = saving === r.id;
                      return (
                        <button
                          key={r.id}
                          disabled={alreadyAdded || isSaving}
                          onClick={() => void handleAdd(r)}
                          className="w-full text-left px-3 py-2.5 rounded-[8px] flex items-center justify-between gap-3 transition-colors"
                          style={{
                            background: alreadyAdded ? "#f5f5f3" : "#fff",
                            border: "0.5px solid rgba(26,26,24,0.12)",
                            opacity: alreadyAdded ? 0.6 : 1,
                            cursor: alreadyAdded ? "default" : "pointer",
                          }}
                          onMouseEnter={(e) => {
                            if (!alreadyAdded)
                              e.currentTarget.style.background = "#f5f5f3";
                          }}
                          onMouseLeave={(e) => {
                            if (!alreadyAdded)
                              e.currentTarget.style.background = "#fff";
                          }}
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium truncate">{r.title}</p>
                            {(r.salary_min || r.salary_max) && (
                              <p className="text-[11px] mt-0.5" style={{ color: "#888780" }}>
                                {r.salary_min
                                  ? `¥${(r.salary_min / 1_000_000).toFixed(1)}M`
                                  : "—"}
                                {" – "}
                                {r.salary_max
                                  ? `¥${(r.salary_max / 1_000_000).toFixed(1)}M`
                                  : "—"}
                              </p>
                            )}
                          </div>
                          {alreadyAdded ? (
                            <span
                              className="text-[11px] font-medium px-2 py-0.5 rounded shrink-0"
                              style={{ background: "#eaf3de", color: "#27500a" }}
                            >
                              Added
                            </span>
                          ) : isSaving ? (
                            <span className="text-[11px] shrink-0" style={{ color: "#888780" }}>
                              Saving…
                            </span>
                          ) : (
                            <IconPlus size={14} style={{ color: "#888780", flexShrink: 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── candidate timeline tab ───────────────────────────────────────────────────

const CAND_INTERACTION_ICON: Record<string, React.ElementType> = {
  call: IconPhone,
  email: IconMail,
  meeting: IconCalendar,
};
const CAND_INTERACTION_COLORS: Record<string, { bg: string; color: string }> = {
  call:    { bg: "#e6f1fb", color: "#185fa5" },
  email:   { bg: "#f5f5f3", color: "#5f5e5a" },
  meeting: { bg: "#eaf3de", color: "#3b6d11" },
};

type CandidateInteraction = {
  id: string;
  interaction_type: string;
  summary: string | null;
  full_notes: string | null;
  interacted_at: string;
  client_id: string | null;
};

function CandidateTimelineTab({
  candidateId,
  recruiterId,
  interactions,
  processes,
}: {
  candidateId: string;
  recruiterId: string;
  interactions: CandidateInteraction[];
  processes: Process[];
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  // Build a unified feed: interactions + process milestone entries
  type FeedEntry =
    | { kind: "interaction"; data: CandidateInteraction; ts: string }
    | { kind: "process"; data: Process; ts: string };

  const feed: FeedEntry[] = [
    ...interactions.map((i) => ({ kind: "interaction" as const, data: i, ts: i.interacted_at })),
    ...processes.map((p) => ({ kind: "process" as const, data: p, ts: p.updated_at })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="space-y-3">
      {/* Transcript / log toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: "#888780" }}>
          {feed.length} {feed.length === 1 ? "entry" : "entries"}
        </p>
        <button
          className="ab flex items-center gap-1"
          onClick={() => setShowTranscript((v) => !v)}
        >
          <IconMessage size={12} />
          {showTranscript ? "Hide transcript" : "Paste transcript"}
        </button>
      </div>

      {showTranscript && (
        <TranscriptPanel
          candidateId={candidateId}
          recruiterId={recruiterId}
          onClose={() => setShowTranscript(false)}
        />
      )}

      {feed.length === 0 && !showTranscript && (
        <div
          className="rounded-xl px-5 py-12 text-center"
          style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
        >
          <p className="text-[13px] font-medium" style={{ color: "#1a1a18" }}>No activity recorded yet.</p>
          <p className="text-[12px] mt-1" style={{ color: "#888780" }}>
            Interactions linked to this candidate and their active processes will appear here.
          </p>
        </div>
      )}

      <div className="space-y-2">
      {feed.map((entry) => {
        if (entry.kind === "interaction") {
          const i = entry.data;
          const type = i.interaction_type ?? "call";
          const Icon = CAND_INTERACTION_ICON[type] ?? IconPhone;
          const colors = CAND_INTERACTION_COLORS[type] ?? CAND_INTERACTION_COLORS.call;
          return (
            <div
              key={`i-${i.id}`}
              className="rounded-xl p-[14px_18px]"
              style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                  style={{ background: colors.bg }}
                >
                  <Icon size={14} style={{ color: colors.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[11px] font-medium capitalize px-[6px] py-[2px] rounded"
                      style={{ background: colors.bg, color: colors.color }}
                    >
                      {type}
                    </span>
                    <span className="text-[11px]" style={{ color: "#b8b7b2" }}>
                      {formatDate(i.interacted_at)}
                    </span>
                  </div>
                  {i.summary && (
                    <p className="text-[13px] font-medium mb-0.5">{i.summary}</p>
                  )}
                  {i.full_notes && (
                    <p className="text-[12px] leading-relaxed" style={{ color: "#5f5e5a" }}>
                      {i.full_notes}
                    </p>
                  )}
                  {!i.summary && !i.full_notes && (
                    <p className="text-[12px]" style={{ color: "#b8b7b2" }}>No notes recorded.</p>
                  )}
                </div>
              </div>
            </div>
          );
        }

        // process milestone entry
        const p = entry.data;
        return (
          <div
            key={`p-${p.id}`}
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}
          >
            <StageBadge stage={p.stage} className="text-[11px]" />
            <span className="flex-1 text-[12px]" style={{ color: "#5f5e5a" }}>
              {p.requisitions?.clients?.company_name ?? "—"}
              {p.requisitions?.title ? ` — ${p.requisitions.title}` : ""}
            </span>
            <span className="text-[11px]" style={{ color: "#b8b7b2" }}>
              {formatDate(p.updated_at)}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ─── CV upload zone ───────────────────────────────────────────────────────────

type ExtractedCandidate = {
  full_name: string | null;
  full_name_japanese: string | null;
  current_title: string | null;
  current_company: string | null;
  age: number | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  japanese_level: string | null;
  english_level: string | null;
  additionalLanguages: string | null;
  notice_period_months: number | null;
  noticePeriodMonths: number | null;
  current_base: number | null;
  current_total: number | null;
  roles: Array<{
    company_name: string;
    title: string;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
    reasonForLeaving: string | null;
  }>;
};

function CvUploadZone({
  candidateId,
  recruiterId,
  cvUrl,
}: {
  candidateId: string;
  recruiterId: string;
  cvUrl: string | null;
}) {
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "uploading" | "uploaded" | "extracting" | "done" | "error">("idle");
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedCandidate | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file || file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    setState("uploading");
    try {
      const path = `${recruiterId}/${candidateId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(path, file);
      if (uploadErr) {
        const msg = uploadErr.message ?? String(uploadErr);
        if (msg.toLowerCase().includes("bucket")) {
          toast.error('Storage bucket not found. Create a private bucket named "resumes" in Supabase Dashboard → Storage.');
        } else {
          toast.error(`Upload failed: ${msg}`);
        }
        setState("error");
        return;
      }

      // Store cv_url on candidate
      await supabase.from("candidates").update({ cv_url: path }).eq("id", candidateId);
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      setUploadedPath(path);
      setState("uploaded");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed. Check the browser console for details.");
      setState("error");
    }
  }

  async function runExtraction(path: string) {
    setState("extracting");
    try {
      const resp = await fetch("/api/ai/extract-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, storageKey: path }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 404) {
          toast.error("API route not found. Run the app with `vercel dev` instead of `npm run dev` to use AI features locally.");
        } else {
          toast.error(`Extraction failed (${resp.status}): ${errText.slice(0, 120)}`);
        }
        setState("uploaded");
        return;
      }
      const data = (await resp.json()) as ExtractedCandidate;
      setExtracted(data);
      setState("done");
      setReviewOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Extraction failed. Check the browser console for details.");
      setState("uploaded");
    }
  }

  return (
    <>
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3 transition-colors"
        style={{
          background: dragging ? "#e6f1fb" : "#f5f5f3",
          border: `0.5px dashed ${dragging ? "#185fa5" : "rgba(26,26,24,0.2)"}`,
          cursor: state === "uploading" || state === "extracting" ? "default" : "pointer",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        onClick={() => {
          if (state !== "uploading" && state !== "extracting") inputRef.current?.click();
        }}
      >
        <IconFileText size={16} style={{ color: "#888780", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          {state === "idle" && (
            <p className="text-[12px]" style={{ color: "#5f5e5a" }}>
              {cvUrl
                ? "CV on file — drop a new PDF to re-extract"
                : "Drop a PDF CV here or click to upload"}
            </p>
          )}
          {state === "uploading" && (
            <p className="text-[12px]" style={{ color: "#185fa5" }}>Uploading…</p>
          )}
          {state === "uploaded" && (
            <p className="text-[12px]" style={{ color: "#27500a" }}>Uploaded — ready to extract</p>
          )}
          {state === "extracting" && (
            <p className="text-[12px]" style={{ color: "#185fa5" }}>Extracting with AI…</p>
          )}
          {state === "done" && (
            <p className="text-[12px]" style={{ color: "#27500a" }}>Extraction complete</p>
          )}
          {state === "error" && (
            <p className="text-[12px]" style={{ color: "#a32d2d" }}>Failed — click to retry</p>
          )}
        </div>
        {state === "uploaded" && uploadedPath && (
          <button
            className="ab"
            onClick={(e) => { e.stopPropagation(); void runExtraction(uploadedPath); }}
          >
            <IconSparkles size={11} /> Extract
          </button>
        )}
        {state === "done" && extracted && (
          <button
            className="ab"
            onClick={(e) => { e.stopPropagation(); setReviewOpen(true); }}
          >
            Review
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {extracted && (
        <ExtractionReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          extracted={extracted}
          candidateId={candidateId}
        />
      )}
    </>
  );
}

// ─── extraction review modal ──────────────────────────────────────────────────

function ExtractionReviewModal({
  open,
  onClose,
  extracted: x,
  candidateId,
}: {
  open: boolean;
  onClose: () => void;
  extracted: ExtractedCandidate;
  candidateId: string;
}) {
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);

  async function applyFields() {
    setApplying(true);
    try {
      // Build patch with only the fields that have extracted values
      const noticePeriod = x.notice_period_months ?? x.noticePeriodMonths;
      const patch = {
        ...(x.full_name           ? { full_name: x.full_name }                        : {}),
        ...(x.full_name_japanese  ? { full_name_japanese: x.full_name_japanese }      : {}),
        ...(x.current_title       ? { current_title: x.current_title }                : {}),
        ...(x.current_company     ? { current_company: x.current_company }            : {}),
        ...(x.age != null         ? { age: x.age }                                    : {}),
        ...(x.email               ? { email: x.email }                                : {}),
        ...(x.phone               ? { phone: x.phone }                                : {}),
        ...(x.linkedinUrl         ? { linkedin_url: x.linkedinUrl }                   : {}),
        ...(x.japanese_level      ? { japanese_level: x.japanese_level }              : {}),
        ...(x.english_level       ? { english_level: x.english_level }                : {}),
        ...(x.additionalLanguages ? { additional_languages: x.additionalLanguages }   : {}),
        ...(noticePeriod != null  ? { notice_period_months: noticePeriod }            : {}),
        ...(x.current_base != null  ? { current_base: x.current_base }               : {}),
        ...(x.current_total != null ? { current_total: x.current_total }              : {}),
      };

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("candidates").update(patch).eq("id", candidateId);
        if (error) throw error;
      }
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Fields applied from CV extraction.");
      onClose();
    } catch {
      toast.error("Failed to apply fields.");
    } finally {
      setApplying(false);
    }
  }

  function row(label: string, value: string | number | null | undefined) {
    if (value == null) return null;
    return (
      <div key={label} className="flex items-baseline justify-between gap-4 py-1.5"
        style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}>
        <span className="text-[12px]" style={{ color: "#888780" }}>{label}</span>
        <span className="text-[13px] font-medium">{String(value)}</span>
      </div>
    );
  }

  const formatSalary = (n: number | null) => n ? `¥${(n / 1_000_000).toFixed(1)}M` : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle>CV extraction review</DialogTitle>
        </DialogHeader>

        <p className="text-[12px] mb-3" style={{ color: "#888780" }}>
          Review the extracted data below. Click "Apply fields" to merge into the candidate record.
          Work history must be added manually.
        </p>

        <div className="mb-4">
          {row("Full name", x.full_name)}
          {row("Japanese name", x.full_name_japanese)}
          {row("Current title", x.current_title)}
          {row("Current company", x.current_company)}
          {row("Age", x.age)}
          {row("Email", x.email)}
          {row("Phone", x.phone)}
          {row("LinkedIn", x.linkedinUrl)}
          {row("Japanese level", x.japanese_level)}
          {row("English level", x.english_level)}
          {row("Additional languages", x.additionalLanguages)}
          {row("Notice period", (x.notice_period_months ?? x.noticePeriodMonths) != null ? `${x.notice_period_months ?? x.noticePeriodMonths} months` : null)}
          {row("Current base", formatSalary(x.current_base))}
          {row("Current total", formatSalary(x.current_total))}
        </div>

        {x.roles && x.roles.length > 0 && (
          <div className="mb-4">
            <p className="sl mb-2">Work history (add manually)</p>
            <div className="space-y-1.5">
              {x.roles.map((r, i) => (
                <div key={i} className="rounded-lg px-3 py-2"
                  style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}>
                  <p className="text-[12px] font-medium">{r.company_name} — {r.title}</p>
                  <p className="text-[11px]" style={{ color: "#888780" }}>
                    {r.start_date ?? "?"} – {r.is_current ? "Present" : (r.end_date ?? "?")}
                  </p>
                  {r.description && (
                    <p className="text-[11px] mt-0.5" style={{ color: "#5f5e5a" }}>{r.description}</p>
                  )}
                  {r.reasonForLeaving && (
                    <p className="text-[11px] mt-0.5" style={{ color: "#888780" }}>Left: {r.reasonForLeaving}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Dismiss</Button>
          <Button size="sm" onClick={() => void applyFields()} disabled={applying}>
            {applying ? "Applying…" : "Apply fields"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── candidate status badge ────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  active:     { bg: "#eaf3de", color: "#27500a", border: "#b0d88a" },
  passive:    { bg: "#fdf3e7", color: "#633806", border: "#fac775" },
  placed:     { bg: "#e6f1fb", color: "#185fa5", border: "#9ec5ef" },
  off_market: { bg: "#f5f5f3", color: "#888780", border: "rgba(26,26,24,0.2)" },
};

function CandidateStatusBadge({ status }: { status: string | null }) {
  const s = STATUS_STYLE[status ?? "active"] ?? STATUS_STYLE.active;
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded capitalize"
      style={{ background: s.bg, color: s.color, border: `0.5px solid ${s.border}` }}
    >
      {(status ?? "active").replace(/_/g, " ")}
    </span>
  );
}

// ─── registration form upload zone ────────────────────────────────────────────

function RegistrationFormUploadZone({
  candidateId,
  recruiterId,
  registrationFormUrl,
}: {
  candidateId: string;
  recruiterId: string;
  registrationFormUrl: string | null;
}) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") { toast.error("PDF files only."); return; }
    setUploading(true);
    try {
      const path = `${recruiterId}/${candidateId}/regform_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(path, file);
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); return; }
      await supabase.from("candidates").update({ registration_form_url: path }).eq("id", candidateId);
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Registration form uploaded.");
    } catch { toast.error("Upload failed."); }
    finally { setUploading(false); }
  }

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors"
      style={{ background: "#f5f5f3", border: "0.5px dashed rgba(26,26,24,0.2)" }}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <IconFileText size={16} style={{ color: "#888780", flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px]" style={{ color: "#5f5e5a" }}>
          {uploading
            ? "Uploading…"
            : registrationFormUrl
            ? "Registration form on file — click to replace"
            : "Registration Form (signed) — drop PDF or click to upload"}
        </p>
      </div>
      {registrationFormUrl && !uploading && (
        <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "#eaf3de", color: "#27500a" }}>
          On file
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

// ─── candidate intelligence card ──────────────────────────────────────────────

function CandidateIntelligenceCard({
  candidateId,
  aiContext,
  aiContextUpdatedAt,
}: {
  candidateId: string;
  aiContext: string | null;
  aiContextUpdatedAt: string | null;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(!!aiContext);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/ai/refresh-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "candidate", entity_id: candidateId }),
      });
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Candidate intelligence refreshed.");
    } catch { toast.error("Refresh failed. Try again."); }
    finally { setRefreshing(false); }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}>
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <IconSparkles size={13} style={{ color: "#888780" }} />
        <span className="flex-1 text-[12px] font-medium" style={{ color: "#5f5e5a" }}>
          Candidate intelligence
        </span>
        {aiContextUpdatedAt && (
          <span className="text-[11px]" style={{ color: "#b8b7b2" }}>
            Updated {relativeTime(aiContextUpdatedAt)}
          </span>
        )}
        <span className="text-[11px]" style={{ color: "#b8b7b2" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {aiContext ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap mb-3" style={{ color: "#1a1a18" }}>
              {aiContext}
            </p>
          ) : (
            <p className="text-[13px] mb-3" style={{ color: "#888780" }}>
              No intelligence summary yet. Click refresh to generate one from the candidate's interactions.
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

// ─── transcript panel ─────────────────────────────────────────────────────────

type TranscriptResult = {
  suggested_field_updates: Array<{ field: string; suggested_value: unknown; previous_value?: unknown; source: string; is_update: boolean }>;
  suggested_motivations: Array<{ rank: number; motivation_type: string; detail: string }>;
  suggested_blockers: Array<{ theme: string; detail: string; is_risk: boolean }>;
  suggested_competing_interviews: Array<{ company_name: string; stage: string; source: string }>;
  interaction_summary: string;
  interaction_full_notes: string;
  interaction_type: string;
  interacted_at: string;
  transcript_raw: string;
};

function TranscriptPanel({ candidateId, recruiterId, onClose }: { candidateId: string; recruiterId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [transcript, setTranscript] = useState("");
  const [interactionType, setInteractionType] = useState<"call" | "meeting">("call");
  const [interactedAt, setInteractedAt] = useState(new Date().toISOString().slice(0, 16));
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editNotes, setEditNotes] = useState("");

  async function process() {
    if (!transcript.trim()) { toast.error("Paste a transcript first."); return; }
    setProcessing(true);
    try {
      const resp = await fetch("/api/ai/process-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, transcript_raw: transcript, interaction_type: interactionType, interacted_at: new Date(interactedAt).toISOString() }),
      });
      const data = (await resp.json()) as TranscriptResult & { error?: string };
      if (data.error) { toast.error("Could not process transcript. Try again."); return; }
      setResult(data);
      setEditSummary(data.interaction_summary ?? "");
      setEditNotes(data.interaction_full_notes ?? "");
      // Default all to accepted
      const acc: Record<string, boolean> = {};
      (data.suggested_field_updates ?? []).forEach((_, i) => { acc[`field_${i}`] = true; });
      (data.suggested_motivations ?? []).forEach((_, i) => { acc[`mot_${i}`] = true; });
      (data.suggested_blockers ?? []).forEach((_, i) => { acc[`blk_${i}`] = true; });
      (data.suggested_competing_interviews ?? []).forEach((_, i) => { acc[`ci_${i}`] = true; });
      setAccepted(acc);
    } catch { toast.error("Could not process transcript. Try again."); }
    finally { setProcessing(false); }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      // Apply accepted field updates
      const acceptedFields = (result.suggested_field_updates ?? []).filter((_, i) => accepted[`field_${i}`]);
      if (acceptedFields.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        acceptedFields.forEach((f) => { patch[f.field] = f.suggested_value; });
        await supabase.from("candidates").update(patch).eq("id", candidateId);
      }

      // Apply accepted motivations
      const acceptedMots = (result.suggested_motivations ?? []).filter((_, i) => accepted[`mot_${i}`]);
      for (const mot of acceptedMots) {
        await supabase.from("candidate_motivations").upsert({ candidate_id: candidateId, rank: mot.rank, motivation_text: mot.detail, motivation_type: mot.motivation_type }, { onConflict: "candidate_id,rank" });
      }

      // Apply accepted blockers
      const acceptedBlk = (result.suggested_blockers ?? []).filter((_, i) => accepted[`blk_${i}`]);
      for (const blk of acceptedBlk) {
        await supabase.from("candidate_blockers").insert({ candidate_id: candidateId, theme: blk.theme, detail: blk.detail, is_risk: blk.is_risk });
      }

      // Apply accepted competing interviews
      const acceptedCI = (result.suggested_competing_interviews ?? []).filter((_, i) => accepted[`ci_${i}`]);
      for (const ci of acceptedCI) {
        await supabase.from("competing_interviews").insert({ candidate_id: candidateId, company_name: ci.company_name, stage: ci.stage, source: ci.source, disclosed_at: result.interacted_at, is_active: true });
      }

      // Create interaction
      const now = new Date(result.interacted_at).toISOString();
      await supabase.from("interactions").insert({
        candidate_id: candidateId,
        recruiter_id: recruiterId,
        interaction_type: result.interaction_type,
        summary: editSummary,
        full_notes: editNotes,
        transcript_raw: result.transcript_raw,
        interacted_at: now,
        triggers_context_refresh: true,
      });

      // Update candidate last_interaction_at and all active processes last_activity_at
      await Promise.all([
        supabase.from("candidates").update({ last_interaction_at: now }).eq("id", candidateId),
        supabase.from("processes")
          .update({ last_activity_at: now })
          .eq("candidate_id", candidateId)
          .not("stage", "in", '("Placed","Closed lost")'),
      ]);

      // Fire context refresh
      fetch("/api/ai/refresh-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "candidate", entity_id: candidateId }),
      }).catch(() => {});

      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Transcript saved.");
      onClose();
    } catch { toast.error("Failed to save. Try again."); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl p-5" style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-medium">Process transcript</p>
        <button className="text-[11px]" style={{ color: "#888780" }} onClick={onClose}>Dismiss</button>
      </div>

      {!result ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Interaction type</Label>
              <Select value={interactionType} onValueChange={(v) => setInteractionType(v as "call" | "meeting")}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Date &amp; time</Label>
              <Input type="datetime-local" value={interactedAt} onChange={(e) => setInteractedAt(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <Textarea
            placeholder="Paste the full transcript from Teams, Otter.ai, Zoom, or your notes here…"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="min-h-[140px] text-[12px]"
          />
          <button className="ab" onClick={() => void process()} disabled={processing}>
            <IconSparkles size={11} />
            {processing ? "Processing…" : "Process transcript"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Field updates */}
          {result.suggested_field_updates.length > 0 && (
            <div>
              <p className="sl mb-2">Suggested field updates</p>
              <div className="space-y-1.5">
                {result.suggested_field_updates.map((f, i) => (
                  <label key={i} className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" checked={accepted[`field_${i}`] ?? true} onChange={(e) => setAccepted((a) => ({ ...a, [`field_${i}`]: e.target.checked }))} className="mt-0.5" />
                    <span>
                      <strong>{f.field}</strong>
                      {f.is_update && f.previous_value !== undefined && (
                        <span style={{ color: "#888780" }}> (was: {String(f.previous_value)})</span>
                      )}
                      {" → "}{String(f.suggested_value)}
                      <span className="ml-1" style={{ color: "#b8b7b2" }}>— {f.source}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Motivations */}
          {result.suggested_motivations.length > 0 && (
            <div>
              <p className="sl mb-2">Suggested motivations</p>
              <div className="space-y-1.5">
                {result.suggested_motivations.map((m, i) => (
                  <label key={i} className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" checked={accepted[`mot_${i}`] ?? true} onChange={(e) => setAccepted((a) => ({ ...a, [`mot_${i}`]: e.target.checked }))} className="mt-0.5" />
                    <span>Rank {m.rank} [{m.motivation_type}]: {m.detail}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Blockers */}
          {result.suggested_blockers.length > 0 && (
            <div>
              <p className="sl mb-2">Suggested blockers</p>
              <div className="space-y-1.5">
                {result.suggested_blockers.map((b, i) => (
                  <label key={i} className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" checked={accepted[`blk_${i}`] ?? true} onChange={(e) => setAccepted((a) => ({ ...a, [`blk_${i}`]: e.target.checked }))} className="mt-0.5" />
                    <span>{b.is_risk ? "⚠ " : ""}<strong>{b.theme}:</strong> {b.detail}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Competing interviews */}
          {result.suggested_competing_interviews.length > 0 && (
            <div>
              <p className="sl mb-2">Suggested competing interviews</p>
              <div className="space-y-1.5">
                {result.suggested_competing_interviews.map((ci, i) => (
                  <label key={i} className="flex items-start gap-2 text-[12px] cursor-pointer">
                    <input type="checkbox" checked={accepted[`ci_${i}`] ?? true} onChange={(e) => setAccepted((a) => ({ ...a, [`ci_${i}`]: e.target.checked }))} className="mt-0.5" />
                    <span>{ci.company_name} — {ci.stage}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Summary + notes */}
          <div>
            <Label className="text-xs mb-1 block">Interaction summary</Label>
            <Input value={editSummary} onChange={(e) => setEditSummary(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Full notes</Label>
            <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="min-h-[100px] text-[12px]" />
          </div>

          <div className="flex gap-2">
            <button className="ab" onClick={() => void save()} disabled={saving}>
              <IconCheck size={11} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="text-[12px]" style={{ color: "#888780" }} onClick={() => setResult(null)}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── submission package panel ─────────────────────────────────────────────────

function SubmissionPackagePanel({
  pkg,
  candidateName,
  onClose,
}: {
  pkg: import("@/integrations/supabase/types").SubmissionPackage;
  candidateName: string;
  onClose: () => void;
}) {
  const [emailBody, setEmailBody] = useState(pkg.email.body);
  const [emailSubject, setEmailSubject] = useState(pkg.email.subject);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const { downloadSingleProfile } = await import("@/lib/pdf-utils");
      await downloadSingleProfile(
        { candidateName, english: pkg.englishContent, japanese: pkg.japaneseContent },
        "",
      );
    } catch { toast.error("PDF generation failed. Try again."); }
    finally { setDownloading(false); }
  }

  function ProfileSection({ label, content }: { label: string; content: import("@/integrations/supabase/types").ProfileContent }) {
    return (
      <div className="rounded-lg p-4" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}>
        <p className="sl mb-3">{label}</p>
        <div className="space-y-3 text-[13px]">
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Executive summary</p>
            <p className="leading-relaxed" style={{ color: "#1a1a18" }}>{content.executiveSummary}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Career motivation</p>
            <p className="leading-relaxed" style={{ color: "#1a1a18" }}>{content.careerMotivation}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Alignment points</p>
            <ul className="space-y-1" style={{ color: "#1a1a18" }}>
              {content.alignment.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: "#888780" }}>·</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Compensation</p>
            <p style={{ color: "#1a1a18" }}>{content.compensation}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "#888780" }}>Closing</p>
            <p style={{ color: "#1a1a18" }}>{content.closing}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded-xl p-5 space-y-5"
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium">Submission package — review before sending</p>
        <div className="flex gap-2">
          <button
            className="ab"
            onClick={() => void downloadPdf()}
            disabled={downloading}
          >
            <IconFileText size={11} />
            {downloading ? "Generating PDF…" : "Download PDF"}
          </button>
          <button className="text-[11px]" style={{ color: "#888780" }} onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>

      {/* Section A — Email */}
      <div>
        <p className="sl mb-2">A — Submission email</p>
        <div className="space-y-2">
          <div>
            <Label className="text-xs mb-1 block">Subject</Label>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="text-xs" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Email body</Label>
              <button
                className="text-[11px] underline underline-offset-2"
                style={{ color: "#185fa5" }}
                onClick={() => { void navigator.clipboard.writeText(emailBody); toast.success("Email copied."); }}
              >
                Copy
              </button>
            </div>
            <Textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="min-h-[160px] text-[12px]"
            />
          </div>
        </div>
      </div>

      {/* Section B — English profile */}
      <ProfileSection label="B — English profile" content={pkg.englishContent} />

      {/* Section C — Japanese profile */}
      <ProfileSection label="C — Japanese profile" content={pkg.japaneseContent} />
    </div>
  );
}
