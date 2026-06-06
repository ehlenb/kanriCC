import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
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
  IconClipboard,
  IconChevronDown,
} from "@tabler/icons-react";
import { TranscriptPanel } from "@/components/candidate/TranscriptPanel";
import { SubmissionPackagePanel } from "@/components/candidate/SubmissionPackagePanel";

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
  status_source: string | null;
  placed_at: string | null;
  coin_icon_dismissed: boolean;
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
  address: string | null;
  date_of_birth: string | null;
  notes_template: string | null;
  notes_interview: string | null;
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
  ccm_outcome: "pass" | "fail" | "pending" | null;
  ccm_feedback_notes: string | null;
  ccm_feedback_at: string | null;
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
          .select("*, notes_presentation, notes_personality, notes_pitch, notes_closing, notes_internal, address, date_of_birth, notes_template, notes_interview")
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
            ccm_outcome, ccm_feedback_notes, ccm_feedback_at,
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
  const [page, setPage] = useState<"timeline" | "notes" | "processes" | "registration">("timeline");

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
          {(c.current_total || c.expected_total_min || c.expected_total_max) && (
            <div className="flex items-center gap-2 mt-0.5 text-[12px]">
              {c.current_total && (
                <span style={{ color: "#1a1a18" }}>
                  Current <strong>{formatYen(c.current_total)}</strong>
                </span>
              )}
              {c.current_total && (c.expected_total_min || c.expected_total_max) && (
                <span style={{ color: "#b8b7b2" }}>·</span>
              )}
              {(c.expected_total_min || c.expected_total_max) && (
                <span style={{ color: "#1a1a18" }}>
                  Expecting{" "}
                  <strong>
                    {c.expected_total_min && c.expected_total_max
                      ? `${formatYen(c.expected_total_min)} – ${formatYen(c.expected_total_max)}`
                      : formatYen(c.expected_total_min ?? c.expected_total_max)}
                  </strong>
                </span>
              )}
            </div>
          )}
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
            { key: "timeline",     label: "Timeline" },
            { key: "notes",        label: "Candidate notes" },
            { key: "processes",    label: "Candidate intelligence" },
            { key: "registration", label: "Registration" },
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
      {page === "timeline" && (
        <CandidateTimelineTab
          candidateId={id}
          recruiterId={user!.id}
          interactions={interactions}
          processes={processes}
        />
      )}
      {page === "notes" && (
        <NotesTab
          candidateId={id}
          candidate={c}
        />
      )}
      {page === "processes" && (
        <ProcessesPage
          candidate={c}
          motivations={motivations}
          blockers={blockers}
          roles={roles}
          competing={competing}
          processes={processes}
          recruiterId={user!.id}
        />
      )}
      {page === "registration" && (
        <RegistrationPage
          candidateId={id}
          recruiterId={user!.id}
          candidate={c}
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
}: {
  candidateId: string;
  recruiterId: string;
  candidate: Candidate;
}) {
  return (
    <div className="space-y-3">
      {/* Registration form upload — primary document */}
      <RegistrationFormUploadZone
        candidateId={candidateId}
        recruiterId={recruiterId}
        registrationFormUrl={c.registration_form_url}
      />

      {/* CV Upload */}
      <CvUploadZone candidateId={candidateId} recruiterId={recruiterId} cvUrl={c.cv_url ?? null} />

      {/* Auto-populated contact details */}
      <Card>
        <div className="flex items-center gap-1.5 mb-3">
          <SectionLabel className="mb-0">Candidate details</SectionLabel>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "#e6f1fb", color: "#185fa5" }}>
            auto-populated from form
          </span>
        </div>
        <div className="space-y-1">
          <RegistrationField label="Full name (English)" fieldKey="full_name" value={c.full_name} candidateId={candidateId} />
          <RegistrationField label="Full name (Japanese)" fieldKey="full_name_japanese" value={c.full_name_japanese} candidateId={candidateId} />
          <DobField candidateId={candidateId} dateOfBirth={c.date_of_birth} age={c.age} />
          <RegistrationField label="Email" fieldKey="email" value={c.email} candidateId={candidateId} inputType="email" placeholder="name@example.com" />
          <RegistrationField label="Phone" fieldKey="phone" value={c.phone} candidateId={candidateId} placeholder="+81 3 0000 0000" />
          <RegistrationField label="Address" fieldKey="address" value={c.address} candidateId={candidateId} placeholder="Tokyo, Minato-ku" />
          <RegistrationField label="LinkedIn" fieldKey="linkedin_url" value={c.linkedin_url} candidateId={candidateId} placeholder="https://linkedin.com/in/…" />
        </div>
        <p className="mt-3 text-[11px] flex items-center gap-1" style={{ color: "#888780" }}>
          <IconInfoCircle size={12} />
          Click any field to edit. Age is calculated automatically from date of birth.
        </p>
      </Card>
    </div>
  );
}

// ─── registration field — inline editable ────────────────────────────────────

function RegistrationField({
  label,
  fieldKey,
  value,
  candidateId,
  placeholder,
  inputType = "text",
  numeric = false,
}: {
  label: string;
  fieldKey: string;
  value: string | null | undefined;
  candidateId: string;
  placeholder?: string;
  inputType?: string;
  numeric?: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  async function save() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value ?? "").trim()) return;
    type CandUpdate = { full_name?: string; full_name_japanese?: string | null; age?: number | null; address?: string | null; email?: string | null; phone?: string | null; linkedin_url?: string | null };
    const savedValue = numeric
      ? (trimmed ? Number(trimmed) : null)
      : (trimmed || null);
    await supabase.from("candidates").update({ [fieldKey]: savedValue } as CandUpdate).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="text-[12px] w-[150px] shrink-0" style={{ color: "#888780" }}>{label}</span>
        <Input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          autoFocus
          className="h-7 text-[13px] flex-1"
          placeholder={placeholder}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 py-1 rounded cursor-pointer group"
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
    >
      <span className="text-[12px] w-[150px] shrink-0" style={{ color: "#888780" }}>{label}</span>
      <span
        className="text-[13px] flex-1 px-1.5 py-0.5 rounded group-hover:bg-[#f5f5f3] transition-colors"
        style={{ color: value ? "#1a1a18" : "#b8b7b2" }}
      >
        {value || "—"}
      </span>
      <IconPencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "#b8b7b2" }} />
    </div>
  );
}

// ─── date-of-birth field ─────────────────────────────────────────────────────

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function DobField({
  candidateId,
  dateOfBirth,
  age,
}: {
  candidateId: string;
  dateOfBirth: string | null;
  age: number | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dateOfBirth ?? "");

  async function save() {
    setEditing(false);
    if (draft === (dateOfBirth ?? "")) return;
    const newAge = draft ? calculateAge(draft) : null;
    await supabase
      .from("candidates")
      .update({ date_of_birth: draft || null, age: newAge })
      .eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
  }

  const displayDob = dateOfBirth
    ? new Date(dateOfBirth).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  if (editing) {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="text-[12px] w-[150px] shrink-0" style={{ color: "#888780" }}>Date of birth</span>
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") { setDraft(dateOfBirth ?? ""); setEditing(false); }
          }}
          autoFocus
          className="h-7 text-[13px] flex-1"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 py-1 rounded cursor-pointer group"
      onClick={() => { setDraft(dateOfBirth ?? ""); setEditing(true); }}
    >
      <span className="text-[12px] w-[150px] shrink-0" style={{ color: "#888780" }}>Date of birth</span>
      <span
        className="text-[13px] flex-1 px-1.5 py-0.5 rounded group-hover:bg-[#f5f5f3] transition-colors"
        style={{ color: displayDob ? "#1a1a18" : "#b8b7b2" }}
      >
        {displayDob
          ? `${displayDob}${age != null ? ` (Age ${age})` : ""}`
          : "—"}
      </span>
      <IconPencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "#b8b7b2" }} />
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

function NotesTab({
  candidateId,
  candidate: c,
}: {
  candidateId: string;
  candidate: Candidate;
}) {
  const qc = useQueryClient();

  type CandNotesPatch = Partial<Pick<Candidate,
    "current_company" | "current_title" | "notes_interview" | "notice_period_months" |
    "urgency_to_move" | "japanese_level" | "english_level" | "additional_languages" |
    "current_base" | "current_bonus" | "current_total" | "expected_total_min" |
    "expected_total_max" | "notes_presentation"
  >>;

  async function saveField(field: string, value: string | number | null) {
    await supabase.from("candidates").update({ [field]: value } as CandNotesPatch).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
  }

  return (
    <div className="space-y-3 pb-8">
      {/* Current Employment */}
      <Card>
        <SectionLabel>Current employment</SectionLabel>
        <NoteField
          label="Company"
          value={c.current_company}
          placeholder="e.g. Sony Corporation"
          onSave={(v) => void saveField("current_company", v)}
        />
        <NoteField
          label="Title"
          value={c.current_title}
          placeholder="e.g. Senior Software Engineer"
          onSave={(v) => void saveField("current_title", v)}
        />
      </Card>

      {/* Interview Notes — largest section */}
      <Card>
        <SectionLabel>Interview notes</SectionLabel>
        <NoteField
          value={c.notes_interview}
          placeholder="Career history, transitions, achievements, background context from registration call…"
          onSave={(v) => void saveField("notes_interview", v)}
          rows={10}
        />
      </Card>

      {/* Notice Period & Urgency */}
      <Card>
        <SectionLabel>Notice period &amp; urgency</SectionLabel>
        <NoticeUrgencyFields
          noticePeriod={c.notice_period_months}
          urgency={c.urgency_to_move}
          onSave={(field, value) => void saveField(field, value)}
        />
      </Card>

      {/* Language Assessment */}
      <Card>
        <SectionLabel>Language assessment</SectionLabel>
        <LanguageFields
          japanese={c.japanese_level}
          english={c.english_level}
          other={c.additional_languages ?? c.other_languages}
          onSave={(field, value) => void saveField(field, value)}
        />
      </Card>

      {/* Compensation */}
      <Card>
        <SectionLabel>Compensation</SectionLabel>
        <NoteCompensationFields
          candidate={c}
          onSave={(field, value) => void saveField(field, value)}
        />
      </Card>

      {/* Recruiter Assessment */}
      <Card>
        <SectionLabel>Recruiter assessment</SectionLabel>
        <NoteField
          label="Presentation &amp; communication"
          value={c.notes_presentation}
          placeholder="How they present in person, communication style, energy level, professionalism…"
          onSave={(v) => void saveField("notes_presentation", v)}
          rows={4}
        />
      </Card>
    </div>
  );
}

// ─── inline note field (click-to-edit) ───────────────────────────────────────

function NoteField({
  label,
  value,
  placeholder,
  onSave,
  rows = 3,
}: {
  label?: string;
  value: string | null | undefined;
  placeholder?: string;
  onSave: (v: string | null) => void;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function handleBlur() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? "").trim()) {
      onSave(trimmed || null);
    }
  }

  return (
    <div className="mb-3 last:mb-0">
      {label && (
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>{label}</p>
      )}
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          rows={rows}
          placeholder={placeholder}
          className="w-full text-[13px] leading-relaxed rounded-[6px] px-3 py-2 resize-none"
          style={{
            border: "0.5px solid rgba(26,26,24,0.20)",
            background: "#fafaf9",
            color: "#1a1a18",
            outline: "none",
          }}
        />
      ) : (
        <div
          className="rounded-[6px] px-3 py-2 cursor-text"
          style={{
            border: "0.5px solid rgba(26,26,24,0.12)",
            background: "#f5f5f3",
            minHeight: rows > 3 ? `${rows * 1.65 * 13}px` : "36px",
          }}
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        >
          {value ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "#1a1a18" }}>{value}</p>
          ) : (
            <p className="text-[13px]" style={{ color: "#b8b7b2" }}>{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── notice period & urgency inline fields ────────────────────────────────────

function NoticeUrgencyFields({
  noticePeriod,
  urgency,
  onSave,
}: {
  noticePeriod: number | null;
  urgency: string | null;
  onSave: (field: string, value: string | number | null) => void;
}) {
  const [editingNotice, setEditingNotice] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState(noticePeriod != null ? String(noticePeriod) : "");

  function saveNotice() {
    setEditingNotice(false);
    const v = noticeDraft.trim() ? Number(noticeDraft) : null;
    if (v !== noticePeriod) onSave("notice_period_months", v);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>Notice period</p>
        {editingNotice ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              autoFocus
              value={noticeDraft}
              onChange={(e) => setNoticeDraft(e.target.value)}
              onBlur={saveNotice}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNotice();
                if (e.key === "Escape") { setNoticeDraft(noticePeriod != null ? String(noticePeriod) : ""); setEditingNotice(false); }
              }}
              className="h-8 text-[13px] w-20"
              placeholder="3"
            />
            <span className="text-[12px]" style={{ color: "#5f5e5a" }}>months</span>
          </div>
        ) : (
          <div
            className="rounded-[6px] px-3 py-2 cursor-text"
            style={{ border: "0.5px solid rgba(26,26,24,0.12)", background: "#f5f5f3", minHeight: "36px" }}
            onClick={() => { setNoticeDraft(noticePeriod != null ? String(noticePeriod) : ""); setEditingNotice(true); }}
          >
            <span className="text-[13px]" style={{ color: noticePeriod != null ? "#1a1a18" : "#b8b7b2" }}>
              {noticePeriod != null ? `${noticePeriod} month${noticePeriod !== 1 ? "s" : ""}` : "e.g. 3 months"}
            </span>
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>Urgency to move</p>
        <Select
          value={urgency ?? "__none__"}
          onValueChange={(v) => onSave("urgency_to_move", v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-[36px] text-[13px]" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }}>
            <SelectValue placeholder="Not specified" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Not specified</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="High">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── language fields ─────────────────────────────────────────────────────────

const JAPANESE_LEVELS = ["Native", "Fluent", "High Business", "Business", "Low Business", "High Conversational", "Conversational", "Low Conversational", "Basic", "None"] as const;
const ENGLISH_LEVELS = ["Native", "Fluent", "High Business", "Business", "Low Business", "High Conversational", "Conversational", "Low Conversational", "Basic", "None"] as const;

function LanguageFields({
  japanese,
  english,
  other,
  onSave,
}: {
  japanese: string | null;
  english: string | null;
  other: string | null | undefined;
  onSave: (field: string, value: string | null) => void;
}) {
  const [editingOther, setEditingOther] = useState(false);
  const [otherDraft, setOtherDraft] = useState(other ?? "");

  function saveOther() {
    setEditingOther(false);
    const trimmed = otherDraft.trim();
    if (trimmed !== (other ?? "").trim()) onSave("additional_languages", trimmed || null);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>Japanese</p>
          <Select value={japanese ?? "__none__"} onValueChange={(v) => onSave("japanese_level", v === "__none__" ? null : v)}>
            <SelectTrigger className="h-[36px] text-[13px]" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }}>
              <SelectValue placeholder="Select level…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not specified</SelectItem>
              {JAPANESE_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>English</p>
          <Select value={english ?? "__none__"} onValueChange={(v) => onSave("english_level", v === "__none__" ? null : v)}>
            <SelectTrigger className="h-[36px] text-[13px]" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }}>
              <SelectValue placeholder="Select level…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not specified</SelectItem>
              {ENGLISH_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>Other languages</p>
        {editingOther ? (
          <Input
            autoFocus
            value={otherDraft}
            onChange={(e) => setOtherDraft(e.target.value)}
            onBlur={saveOther}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveOther();
              if (e.key === "Escape") { setOtherDraft(other ?? ""); setEditingOther(false); }
            }}
            className="h-8 text-[13px]"
            placeholder="e.g. Mandarin (conversational)"
          />
        ) : (
          <div
            className="rounded-[6px] px-3 py-2 cursor-text"
            style={{ border: "0.5px solid rgba(26,26,24,0.12)", background: "#f5f5f3", minHeight: "36px" }}
            onClick={() => { setOtherDraft(other ?? ""); setEditingOther(true); }}
          >
            <span className="text-[13px]" style={{ color: other ? "#1a1a18" : "#b8b7b2" }}>
              {other || "e.g. Mandarin (conversational)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── compensation inline fields (notes tab) ───────────────────────────────────

function NoteCompensationFields({
  candidate: c,
  onSave,
}: {
  candidate: Candidate;
  onSave: (field: string, value: number | null) => void;
}) {
  function YenField({ label, fieldKey, value }: { label: string; fieldKey: string; value: number | null }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value != null ? String(value / 1_000_000) : "");

    function save() {
      setEditing(false);
      const parsed = draft.trim() ? Math.round(Number(draft) * 1_000_000) : null;
      if (parsed !== value) onSave(fieldKey, parsed);
    }

    return (
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>{label}</p>
        {editing ? (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "#888780" }}>¥</span>
            <Input
              autoFocus
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { setDraft(value != null ? String(value / 1_000_000) : ""); setEditing(false); }
              }}
              className="h-[36px] text-[13px] pl-6"
              placeholder="e.g. 12"
            />
            <p className="text-[11px] mt-0.5" style={{ color: "#b8b7b2" }}>¥M — type 12 for ¥12M</p>
          </div>
        ) : (
          <div
            className="rounded-[6px] px-3 py-2 cursor-text"
            style={{ border: "0.5px solid rgba(26,26,24,0.12)", background: "#f5f5f3", minHeight: "36px" }}
            onClick={() => { setDraft(value != null ? String(value / 1_000_000) : ""); setEditing(true); }}
          >
            <span className="text-[13px]" style={{ color: value != null ? "#1a1a18" : "#b8b7b2" }}>
              {value != null ? formatYen(value) : "¥ —M"}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <YenField label="Current base" fieldKey="current_base" value={c.current_base} />
        <YenField label="Current bonus" fieldKey="current_bonus" value={c.current_bonus} />
        <YenField label="Current total" fieldKey="current_total" value={c.current_total} />
      </div>
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#5f5e5a" }}>Expected range</p>
        <div className="grid grid-cols-2 gap-3">
          <YenField label="Min" fieldKey="expected_total_min" value={c.expected_total_min} />
          <YenField label="Max" fieldKey="expected_total_max" value={c.expected_total_max} />
        </div>
      </div>
    </div>
  );
}

// ─── processes page ───────────────────────────────────────────────────────────

function ProcessesPage({
  candidate: c,
  motivations,
  blockers,
  roles,
  competing,
  processes,
  recruiterId,
}: {
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  roles: Role[];
  competing: CompetingInterview[];
  processes: Process[];
  recruiterId: string;
}) {
  const [activeProcessId, setActiveProcessId] = useState<string | null>(
    processes[0]?.id ?? null,
  );
  const [addProcessOpen, setAddProcessOpen] = useState(false);
  const [compensationOpen, setCompensationOpen] = useState(false);
  const [syncingComp, setSyncingComp] = useState(false);
  const qcProcesses = useQueryClient();

  async function handleSyncCompFromNotes() {
    setSyncingComp(true);
    try {
      const res = await fetch("/api/ai/extract-compensation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: c.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "Could not extract compensation. Try again.");
        return;
      }
      const { extracted } = (await res.json()) as { extracted: Record<string, number | null> };
      const fields = Object.entries(extracted).filter(([, v]) => v != null);
      if (fields.length === 0) {
        toast.info("No salary figures found in the candidate notes.");
        return;
      }
      const labels = fields.map(([k]) =>
        k === "current_base" ? "current base"
          : k === "current_total" ? "current total"
          : k === "expected_total_min" ? "expected min"
          : k === "expected_total_max" ? "expected max"
          : k,
      );
      toast.success(`Synced from notes: ${labels.join(", ")}`);
      void qcProcesses.invalidateQueries({ queryKey: ["candidate-profile", c.id] });
    } catch {
      toast.error("Sync failed. Check your connection.");
    } finally {
      setSyncingComp(false);
    }
  }

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
        <CompensationCard
          candidate={c}
          onEdit={() => setCompensationOpen(true)}
          onSyncFromNotes={() => void handleSyncCompFromNotes()}
          syncing={syncingComp}
        />
      </div>

      {/* Profile data — feeds AI context */}
      <CandidateProfileSection
        candidateId={c.id}
        candidate={c}
        motivations={motivations}
        blockers={blockers}
        roles={roles}
        competing={competing}
      />

      <EditCompensationDialog
        candidateId={c.id}
        candidate={c}
        open={compensationOpen}
        onClose={() => setCompensationOpen(false)}
      />
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
          placed_at: new Date().toISOString(),
          coin_icon_dismissed: false,
          placement_guarantee_until: guarantee.toISOString().slice(0, 10),
          // status_source intentionally omitted — placement via process is not a manual toggle
        } as { candidate_status: string; placed_at: string; coin_icon_dismissed: boolean; placement_guarantee_until: string }).eq("id", candidateId);
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
  const [loadingInterviewPrep, setLoadingInterviewPrep] = useState(false);
  const [interviewPrep, setInterviewPrep] = useState<{ candidate_email: string; recruiter_prep_note: string } | null>(null);
  const [loadingSpecEmail, setLoadingSpecEmail] = useState(false);
  const [specEmail, setSpecEmail] = useState<{ email: string; talking_points: string[] } | null>(null);

  const ccmMatch = /^CCM(\d+)$/.exec(p.stage);
  const ccmNumber = ccmMatch ? parseInt(ccmMatch[1], 10) : null;

  const qc = useQueryClient();
  const [feedbackOutcome, setFeedbackOutcome] = useState<"pass" | "fail" | "pending">(
    p.ccm_outcome ?? "pending",
  );
  const [feedbackNotes, setFeedbackNotes] = useState(p.ccm_feedback_notes ?? "");
  const [savingFeedback, setSavingFeedback] = useState(false);

  async function saveFeedback() {
    setSavingFeedback(true);
    try {
      const { error } = await supabase
        .from("processes")
        .update({
          ccm_outcome: feedbackOutcome,
          ccm_feedback_notes: feedbackNotes.trim() || null,
          ccm_feedback_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (error) throw error;
      void qc.invalidateQueries({ queryKey: ["candidate-profile", c.id] });
      toast.success("Feedback saved.");
    } catch {
      toast.error("Could not save feedback. Try again.");
    } finally {
      setSavingFeedback(false);
    }
  }

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
        body: JSON.stringify({ entity_type: "candidate", entity_id: c.id, process_id: p.id }),
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

  async function generateInterviewPrep() {
    if (!ccmNumber) return;
    setLoadingInterviewPrep(true);
    try {
      const resp = await fetch("/api/ai/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_id: p.id, ccm_number: ccmNumber }),
      });
      const json = await resp.json() as { candidate_email?: string; recruiter_prep_note?: string; error?: string };
      if (json.error) { toast.error("Could not generate interview prep. Try again."); return; }
      if (json.candidate_email && json.recruiter_prep_note) {
        setInterviewPrep({ candidate_email: json.candidate_email, recruiter_prep_note: json.recruiter_prep_note });
      }
    } catch {
      toast.error("Could not generate interview prep. Try again.");
    } finally {
      setLoadingInterviewPrep(false);
    }
  }

  async function generateSpecEmail() {
    if (!p.requisitions?.id) { toast.error("No requisition linked to this process."); return; }
    setLoadingSpecEmail(true);
    try {
      const resp = await fetch("/api/ai/spec-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: c.id, requisition_id: p.requisitions.id }),
      });
      const json = await resp.json() as { email?: string; talking_points?: string[]; error?: string };
      if (json.error) { toast.error("Could not generate spec email. Try again."); return; }
      if (json.email && json.talking_points) {
        setSpecEmail({ email: json.email, talking_points: json.talking_points });
      }
    } catch {
      toast.error("Could not generate spec email. Try again.");
    } finally {
      setLoadingSpecEmail(false);
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

      {/* CCM feedback — only shown for CCM stages */}
      {ccmNumber !== null && (
        <div className="mb-4 rounded-lg p-4" style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }}>
          <SectionLabel>CCM{ccmNumber} client feedback</SectionLabel>
          <div className="flex gap-2 mb-3">
            {(["pass", "pending", "fail"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFeedbackOutcome(opt)}
                className="text-[12px] px-3 py-1 rounded-md font-medium transition-colors"
                style={{
                  background: feedbackOutcome === opt
                    ? opt === "pass" ? "#eaf3de" : opt === "fail" ? "#fcebeb" : "#fdf3e7"
                    : "#fff",
                  color: feedbackOutcome === opt
                    ? opt === "pass" ? "#27500a" : opt === "fail" ? "#a32d2d" : "#633806"
                    : "#888780",
                  border: feedbackOutcome === opt
                    ? opt === "pass" ? "0.5px solid #b0d88a" : opt === "fail" ? "0.5px solid #f0b0b0" : "0.5px solid #fac775"
                    : "0.5px solid rgba(26,26,24,0.16)",
                }}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
          <textarea
            value={feedbackNotes}
            onChange={(e) => setFeedbackNotes(e.target.value)}
            placeholder="Client feedback notes — what did they say? Any concerns raised?"
            rows={3}
            className="w-full rounded-lg p-3 text-[12px] leading-relaxed resize-none outline-none mb-2"
            style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.16)", color: "#1a1a18" }}
          />
          <button
            className="ab"
            onClick={() => void saveFeedback()}
            disabled={savingFeedback}
          >
            <IconCheck size={11} />
            {savingFeedback ? "Saving…" : p.ccm_feedback_at ? "Update feedback" : "Save feedback"}
          </button>
          {p.ccm_feedback_at && (
            <span className="text-[11px] ml-2" style={{ color: "#888780" }}>
              Last saved {relativeTime(p.ccm_feedback_at)}
            </span>
          )}
        </div>
      )}

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
        {ccmNumber !== null && (
          <button className="ab" onClick={generateInterviewPrep} disabled={loadingInterviewPrep}>
            <IconClipboard size={12} />
            {loadingInterviewPrep ? "Generating…" : "Interview prep"}
          </button>
        )}
        {p.stage === "Specs Sent" && (
          <button className="ab" onClick={generateSpecEmail} disabled={loadingSpecEmail}>
            <IconMail size={12} />
            {loadingSpecEmail ? "Generating…" : "Spec email"}
          </button>
        )}
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

      {/* Spec email output */}
      {specEmail && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="sl" style={{ color: "#185fa5" }}>Spec email</p>
            <button onClick={() => setSpecEmail(null)} className="text-[11px]" style={{ color: "#888780" }}>Dismiss</button>
          </div>
          <textarea
            value={specEmail.email}
            onChange={(e) => setSpecEmail((prev) => prev ? { ...prev, email: e.target.value } : prev)}
            rows={8}
            className="w-full rounded-lg p-3 text-[13px] leading-relaxed resize-y outline-none mb-2"
            style={{ background: "#e6f1fb", border: "0.5px solid rgba(24,95,165,0.3)", color: "#1a1a18" }}
          />
          <p className="sl mb-1.5">Talking points (if calling)</p>
          <div className="space-y-1">
            {specEmail.talking_points.map((pt, i) => (
              <div key={i} className="flex gap-2 text-[13px]">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "#185fa5" }} />
                <span>{pt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interview prep output */}
      {interviewPrep && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="sl" style={{ color: "#185fa5" }}>Interview prep — CCM{ccmNumber}</p>
            <button onClick={() => setInterviewPrep(null)} className="text-[11px]" style={{ color: "#888780" }}>Dismiss</button>
          </div>
          <p className="sl mb-1">Candidate email</p>
          <textarea
            value={interviewPrep.candidate_email}
            onChange={(e) => setInterviewPrep((prev) => prev ? { ...prev, candidate_email: e.target.value } : prev)}
            rows={12}
            className="w-full rounded-lg p-3 text-[13px] leading-relaxed resize-y outline-none mb-3"
            style={{ background: "#e6f1fb", border: "0.5px solid rgba(24,95,165,0.3)", color: "#1a1a18" }}
          />
          <p className="sl mb-1">Recruiter prep notes</p>
          <textarea
            value={interviewPrep.recruiter_prep_note}
            onChange={(e) => setInterviewPrep((prev) => prev ? { ...prev, recruiter_prep_note: e.target.value } : prev)}
            rows={5}
            className="w-full rounded-lg p-3 text-[13px] leading-relaxed resize-y outline-none"
            style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)", color: "#1a1a18" }}
          />
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
  const [loadingScript, setLoadingScript] = useState(false);
  const [scriptContent, setScriptContent] = useState<string | null>(null);

  async function generateClosingScript() {
    setLoadingScript(true);
    try {
      const resp = await fetch("/api/ai/closing-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_id: p.id }),
      });
      const json = await resp.json() as { content?: string; error?: string };
      if (json.error) { toast.error("Could not generate closing script. Try again."); return; }
      if (json.content) setScriptContent(json.content);
    } catch {
      toast.error("Could not generate closing script. Try again.");
    } finally {
      setLoadingScript(false);
    }
  }

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
        <button className="ab" onClick={generateClosingScript} disabled={loadingScript}>
          <IconPhone size={12} />
          {loadingScript ? "Generating…" : "Closing script"}
        </button>
        <button className="ab" onClick={() => scriptContent ? undefined : generateClosingScript()} disabled={loadingScript}>
          <IconShield size={12} />
          {loadingScript ? "Generating…" : "Counteroffer prep"}
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

      {/* Closing script / counteroffer prep output */}
      {scriptContent && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="sl" style={{ color: "#185fa5" }}>Closing script</p>
            <button
              onClick={() => setScriptContent(null)}
              className="text-[11px]"
              style={{ color: "#888780" }}
            >
              Dismiss
            </button>
          </div>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            rows={18}
            className="w-full rounded-lg p-3 text-[13px] leading-relaxed resize-y outline-none font-mono"
            style={{
              background: "#e6f1fb",
              border: "0.5px solid rgba(24,95,165,0.3)",
              color: "#1a1a18",
            }}
          />
        </div>
      )}
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
  call:              IconPhone,
  email:             IconMail,
  meeting:           IconCalendar,
  "job spec sent":   IconFileText,
  "linkedin message": IconMessage,
  other:             IconClipboard,
};
const CAND_INTERACTION_COLORS: Record<string, { bg: string; color: string }> = {
  call:              { bg: "#e6f1fb", color: "#185fa5" },
  email:             { bg: "#f5f5f3", color: "#5f5e5a" },
  meeting:           { bg: "#eaf3de", color: "#3b6d11" },
  "job spec sent":   { bg: "#fef3e2", color: "#974c00" },
  "linkedin message":{ bg: "#f0eafb", color: "#6b3fa0" },
  other:             { bg: "#f5f5f3", color: "#888780" },
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
  const queryClient = useQueryClient();
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

  const [showLogActivity, setShowLogActivity] = useState(false);

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: "#888780" }}>
          {feed.length} {feed.length === 1 ? "entry" : "entries"}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="ab flex items-center gap-1"
            onClick={() => { setShowLogActivity((v) => !v); setShowTranscript(false); }}
          >
            <IconPlus size={12} />
            {showLogActivity ? "Cancel" : "Log activity"}
          </button>
          <button
            className="ab flex items-center gap-1"
            onClick={() => { setShowTranscript((v) => !v); setShowLogActivity(false); }}
          >
            <IconMessage size={12} />
            {showTranscript ? "Hide transcript" : "Paste transcript"}
          </button>
        </div>
      </div>

      {showLogActivity && (
        <LogActivityPanel
          candidateId={candidateId}
          recruiterId={recruiterId}
          onSaved={() => {
            setShowLogActivity(false);
            void queryClient.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
          }}
        />
      )}

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

// ─── candidate status toggle ──────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  active:  { bg: "#eaf3de", color: "#27500a", border: "#b0d88a" },
  passive: { bg: "#fdf3e7", color: "#633806", border: "#fac775" },
  placed:  { bg: "#e6f1fb", color: "#185fa5", border: "#9ec5ef" },
};

const STATUS_OPTIONS_LIST = [
  { value: "active",  label: "Active" },
  { value: "passive", label: "Passive" },
  { value: "placed",  label: "Placed" },
] as const;

function StatusToggle({
  candidateId,
  status,
  statusSource,
  placedAt,
  coinIconDismissed,
}: {
  candidateId: string;
  status: string | null;
  statusSource: string | null;
  placedAt: string | null;
  coinIconDismissed: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = status ?? "active";
  const s = STATUS_STYLE[current] ?? STATUS_STYLE.active;
  const isManual = statusSource === "manual";

  const showCoin = current === "placed"
    && !coinIconDismissed
    && placedAt !== null
    && Date.now() - new Date(placedAt).getTime() < 90 * 86400000;

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  async function setStatus(newStatus: string) {
    setOpen(false);
    const patch: { candidate_status: string; status_source: string; placed_at?: string; coin_icon_dismissed?: boolean } = {
      candidate_status: newStatus,
      status_source: "manual",
    };
    if (newStatus === "placed" && current !== "placed") {
      patch.placed_at = new Date().toISOString();
      patch.coin_icon_dismissed = false;
    }
    const { error } = await supabase.from("candidates").update(patch).eq("id", candidateId);
    if (error) { toast.error("Could not update status. Try again."); return; }
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
    void qc.invalidateQueries({ queryKey: ["candidates"] });
  }

  async function dismissCoin(e: React.MouseEvent) {
    e.stopPropagation();
    const { error } = await supabase.from("candidates").update({ coin_icon_dismissed: true }).eq("id", candidateId);
    if (error) { toast.error("Could not update. Try again."); return; }
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
    void qc.invalidateQueries({ queryKey: ["candidates"] });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ background: s.bg, color: s.color, border: `0.5px solid ${s.border}` }}
        >
          <span className="capitalize">{current}</span>
          <IconChevronDown size={10} />
        </button>

        {open && (
          <div
            className="absolute left-0 z-20 mt-0.5 w-32 overflow-hidden rounded-md shadow-md"
            style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.16)", top: "100%" }}
          >
            {STATUS_OPTIONS_LIST.map((opt) => {
              const st = STATUS_STYLE[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[#f5f5f3]"
                  onClick={() => void setStatus(opt.value)}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: st.color }}
                  />
                  {opt.label}
                  {opt.value === current && <IconCheck size={11} className="ml-auto" style={{ color: st.color }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isManual && (
        <IconPencil size={10} style={{ color: "#888780" }} title="Manually set" />
      )}

      {showCoin && (
        <span className="flex items-center gap-0.5">
          <span title="Placed within 90 days">🪙</span>
          <button
            type="button"
            className="text-[10px] leading-none"
            style={{ color: "#888780" }}
            title="Dismiss placement flag"
            onClick={(e) => void dismissCoin(e)}
          >
            ×
          </button>
        </span>
      )}
    </div>
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
  const [fetchingUrl, setFetchingUrl] = useState(false);
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

  async function handleView(e: React.MouseEvent) {
    e.stopPropagation();
    if (!registrationFormUrl) return;
    setFetchingUrl(true);
    try {
      const { data, error } = await supabase.storage.from("resumes").createSignedUrl(registrationFormUrl, 120);
      if (error || !data?.signedUrl) { toast.error("Could not open registration form. Try again."); return; }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open registration form. Try again.");
    } finally {
      setFetchingUrl(false);
    }
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
        <>
          <button
            onClick={handleView}
            disabled={fetchingUrl}
            className="text-[11px] px-2 py-0.5 rounded shrink-0"
            style={{ background: "#e6f1fb", color: "#185fa5", border: "0.5px solid rgba(24,95,165,0.3)" }}
          >
            {fetchingUrl ? "Opening…" : "View / Download"}
          </button>
          <span className="text-[11px] px-2 py-0.5 rounded shrink-0" style={{ background: "#eaf3de", color: "#27500a" }}>
            On file
          </span>
        </>
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

// ─── log activity panel ───────────────────────────────────────────────────────

const LOG_ACTIVITY_TYPES = ["call", "email", "meeting", "job spec sent", "linkedin message", "other"] as const;

function LogActivityPanel({
  candidateId,
  recruiterId,
  onSaved,
}: {
  candidateId: string;
  recruiterId: string;
  onSaved: () => void;
}) {
  const [type, setType] = useState<string>("call");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["clients-list-slim"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, company_name")
        .order("company_name")
        .limit(200);
      return (data ?? []) as { id: string; company_name: string }[];
    },
    staleTime: 60_000,
    retry: 1,
  });

  async function save() {
    if (!summary.trim()) { toast.error("A summary is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("interactions").insert({
      candidate_id: candidateId,
      recruiter_id: recruiterId,
      interaction_type: type,
      interacted_at: new Date(date + "T09:00:00").toISOString(),
      summary: summary.trim(),
      full_notes: notes.trim() || null,
      client_id: clientId || null,
    });
    setSaving(false);
    if (error) { toast.error("Failed to log activity."); return; }
    toast.success("Activity logged.");
    setSummary("");
    setNotes("");
    setClientId(null);
    onSaved();
  }

  return (
    <Card>
      <SectionLabel>Log activity</SectionLabel>
      <div className="space-y-3 mt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize text-[13px]">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-[13px]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px]">Summary *</Label>
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Initial screening call — strong profile, moving forward"
            className="text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px]">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detailed notes from this interaction…"
            className="min-h-[80px] text-[13px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px]">Linked client (optional)</Label>
          <Select
            value={clientId ?? "__none__"}
            onValueChange={(v) => setClientId(v === "__none__" ? null : v)}
          >
            <SelectTrigger className="h-8 text-[13px]">
              <SelectValue placeholder="Link to a client if applicable…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-[13px]">No client</SelectItem>
              {(clients ?? []).map((cl) => (
                <SelectItem key={cl.id} value={cl.id} className="text-[13px]">
                  {cl.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clientId && (
            <p className="text-[11px] flex items-center gap-1" style={{ color: "#5f5e5a" }}>
              <IconInfoCircle size={11} />
              This activity will also appear on the linked client's timeline
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => void save()} disabled={saving || !summary.trim()}>
            {saving ? "Saving…" : "Log activity"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── candidate profile section (in intelligence tab) ─────────────────────────

function CandidateProfileSection({
  candidateId,
  candidate: c,
  motivations,
  blockers,
  roles,
  competing,
}: {
  candidateId: string;
  candidate: Candidate;
  motivations: Motivation[];
  blockers: Blocker[];
  roles: Role[];
  competing: CompetingInterview[];
}) {
  type DialogType = "motivation" | "role" | "blocker" | "competing" | "compensation";
  const [openDialog, setOpenDialog] = useState<DialogType | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const close = () => setOpenDialog(null);
  const qc = useQueryClient();

  return (
    <div className="mt-4 space-y-3">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setProfileOpen((v) => !v)}
      >
        <span className="text-[12px] font-medium" style={{ color: "#5f5e5a" }}>Candidate profile data</span>
        <span className="text-[11px]" style={{ color: "#b8b7b2" }}>{profileOpen ? "▴" : "▾"}</span>
        <span className="text-[11px] ml-auto" style={{ color: "#b8b7b2" }}>feeds AI context</span>
      </button>

      {profileOpen && (
        <div className="space-y-3">
          {/* Status & Source */}
          <Card>
            <SectionLabel>Status &amp; source</SectionLabel>
            <div className="grid grid-cols-2 gap-x-6">
              <FieldRow label="Candidate status">
                <StatusToggle
                  candidateId={candidateId}
                  status={c.candidate_status}
                  statusSource={c.status_source}
                  placedAt={c.placed_at}
                  coinIconDismissed={c.coin_icon_dismissed}
                />
              </FieldRow>
              <FieldRow label="Source">{c.source ?? "—"}</FieldRow>
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
              <p className="text-[13px]" style={{ color: "#888780" }}>No roles added yet.</p>
            ) : (
              <div className="pl-1 mt-1">
                {roles.map((role, i) => (
                  <RoleBlock key={role.id} role={role} isLast={i === roles.length - 1} />
                ))}
              </div>
            )}
          </Card>

          {/* Motivations */}
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
              <p className="text-[13px]" style={{ color: "#888780" }}>No motivations recorded yet.</p>
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
                AI uses this ranking to sequence positioning talking points
              </p>
            )}
          </Card>

          {/* Blockers */}
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
                    <span style={{ color: b.is_risk ? "#1a1a18" : "#5f5e5a" }}>{b.detail}</span>
                  </span>
                </div>
              ))
            )}
          </Card>

          {/* Competing interviews */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel className="mb-0">Competing interviews &amp; applications — at registration</SectionLabel>
              <button className="ab" onClick={() => setOpenDialog("competing")}>
                <IconPlus size={11} /> Add
              </button>
            </div>
            {competing.length === 0 ? (
              <p className="text-[13px]" style={{ color: "#888780" }}>None recorded at registration.</p>
            ) : (
              competing.map((ci) => (
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
              ))
            )}
          </Card>

          {/* AI intelligence */}
          <CandidateIntelligenceCard
            candidateId={candidateId}
            aiContext={c.ai_context}
            aiContextUpdatedAt={c.ai_context_updated_at}
          />
        </div>
      )}

      <AddMotivationDialog
        candidateId={candidateId}
        existingRanks={motivations.map((m) => m.rank)}
        open={openDialog === "motivation"}
        onClose={close}
      />
      <AddRoleDialog candidateId={candidateId} open={openDialog === "role"} onClose={close} />
      <AddBlockerDialog candidateId={candidateId} open={openDialog === "blocker"} onClose={close} />
      <AddCompetingDialog candidateId={candidateId} open={openDialog === "competing"} onClose={close} />
    </div>
  );
}

// ─── note template modal ──────────────────────────────────────────────────────

// ─── compensation card + edit dialog ─────────────────────────────────────────

function CompensationCard({
  candidate: c,
  onEdit,
  onSyncFromNotes,
  syncing = false,
}: {
  candidate: Candidate;
  onEdit: () => void;
  onSyncFromNotes?: () => void;
  syncing?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel className="mb-0">Compensation</SectionLabel>
        <div className="flex items-center gap-2">
          {onSyncFromNotes && c.notes_template && (
            <button
              className="ab flex items-center gap-1"
              onClick={onSyncFromNotes}
              disabled={syncing}
              title="Extract salary from candidate notes"
            >
              <IconSparkles size={11} />
              {syncing ? "Syncing…" : "Sync from notes"}
            </button>
          )}
          <button className="ab flex items-center gap-1" onClick={onEdit}>
            <IconPencil size={11} /> Edit
          </button>
        </div>
      </div>
      <FieldRow label="Current">
        {c.current_total
          ? <>{formatYen(c.current_total)} total{c.current_base ? ` (Base ${formatYen(c.current_base)}` : ""}{c.current_bonus ? ` + Bonus ${formatYen(c.current_bonus)})` : c.current_base ? ")" : ""}</>
          : "—"}
      </FieldRow>
      <FieldRow label="Expected">
        {c.expected_total_min || c.expected_total_max
          ? `${formatYen(c.expected_total_min)} – ${formatYen(c.expected_total_max)} total`
          : "—"}
      </FieldRow>
    </Card>
  );
}

function EditCompensationDialog({
  candidateId,
  candidate: c,
  open,
  onClose,
}: {
  candidateId: string;
  candidate: Candidate;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // Inputs use ¥M notation; DB stores raw yen (×1,000,000)
  const toM = (v: number | null) => (v != null ? String(v / 1_000_000) : "");
  const [form, setForm] = useState({
    current_base:       toM(c.current_base),
    current_bonus:      toM(c.current_bonus),
    current_total:      toM(c.current_total),
    expected_total_min: toM(c.expected_total_min),
    expected_total_max: toM(c.expected_total_max),
  });

  function setF<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const nYen = (s: string) => (s.trim() ? Math.round(Number(s) * 1_000_000) : null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidates").update({
        current_base:       nYen(form.current_base),
        current_bonus:      nYen(form.current_bonus),
        current_total:      nYen(form.current_total),
        expected_total_min: nYen(form.expected_total_min),
        expected_total_max: nYen(form.expected_total_max),
      }).eq("id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Compensation updated");
      onClose();
    },
    onError: () => toast.error("Failed to save compensation"),
  });

  function YenInput({ label, k }: { label: string; k: "current_base" | "current_bonus" | "current_total" | "expected_total_min" | "expected_total_max" }) {
    return (
      <div className="space-y-1.5">
        <Label className="text-[12px]">{label}</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "#888780" }}>¥</span>
          <Input
            type="number"
            value={form[k]}
            onChange={(e) => setF(k, e.target.value)}
            className="pl-6 text-[13px]"
            placeholder="e.g. 12"
          />
        </div>
        <p className="text-[11px]" style={{ color: "#b8b7b2" }}>Enter in ¥M — type 12 for ¥12M</p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit compensation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <YenInput label="Current base" k="current_base" />
            <YenInput label="Current bonus" k="current_bonus" />
            <YenInput label="Current total" k="current_total" />
          </div>
          <div className="h-px" style={{ background: "rgba(26,26,24,0.1)" }} />
          <div className="grid grid-cols-2 gap-3">
            <YenInput label="Expected total (min)" k="expected_total_min" />
            <YenInput label="Expected total (max)" k="expected_total_max" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

