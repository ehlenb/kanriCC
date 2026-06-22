import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import {
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
  IconUpload,
  IconX,
  IconTrash,
  IconCopy,
  IconSend,
  IconVideo,
  IconRobot,
} from "@tabler/icons-react";
import { TranscriptPanel } from "@/components/candidate/TranscriptPanel";
import { SubmissionPackagePanel } from "@/components/candidate/SubmissionPackagePanel";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { LogActivityModal } from "@/components/shared/LogActivityModal";
import { SendEmailDialog } from "@/components/shared/SendEmailDialog";
import { LiveCallPanel } from "@/components/shared/LiveCallPanel";

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
  cv_url_jp_shokumu?: string | null;
  cv_url_jp_rireki?: string | null;
  registration_form_url: string | null;
  address: string | null;
  date_of_birth: string | null;
  notes_template: string | null;
  notes_interview: string | null;
  urgency_notes: string | null;
  comp_notes: string | null;
  industry_preferences: string | null;
  location_preferences: string | null;
  ai_context: string | null;
  ai_context_updated_at: string | null;
  updated_at: string;
  team_id: string;
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
  not_interested_at: string | null;
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
  // Strip markdown code fences or bare "json" token the model occasionally adds
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^json\s*\n?/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { points?: Array<{ label: string; body: string }> };
    if (Array.isArray(parsed.points) && parsed.points.length > 0) return parsed.points;
  } catch {
    // legacy plain-text snapshot — wrap as a single block so it still renders
    return [{ label: "Talking points", body: raw }];
  }
  return null;
}

// ─── AI toolbox dropdown ──────────────────────────────────────────────────────

type ToolboxAction = {
  key: string;
  label: string;
  icon: React.ElementType;
  loading: boolean;
  onRun: () => void;
};

function AIToolbox({ actions, inline = false }: { actions: ToolboxAction[]; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const anyLoading = actions.some((a) => a.loading);
  const loadingAction = actions.find((a) => a.loading);

  // inline mode: single-action button shown as a link (used inside text blocks)
  if (inline && actions.length === 1) {
    const a = actions[0];
    const Icon = a.icon;
    return (
      <button
        onClick={() => { a.onRun(); }}
        disabled={a.loading}
        className="inline-flex items-center gap-1 underline underline-offset-2 text-[13px]"
        style={{ color: "var(--color-indigo)" }}
      >
        <Icon size={11} />
        {a.loading ? "Generating…" : a.label}
      </button>
    );
  }

  return (
    <div className="relative mt-2">
      <button
        className="ab flex items-center gap-1.5"
        onClick={() => setOpen((v) => !v)}
        disabled={anyLoading}
      >
        <IconSparkles size={12} />
        {anyLoading ? `${loadingAction?.label ?? "Generating"}…` : "AI tools"}
        <IconChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 z-20 mt-1 min-w-[200px] overflow-hidden"
            style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
          >
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--color-ink-10)] transition-colors"
                  style={{ color: a.loading ? "var(--color-ink-30)" : "var(--color-ink)" }}
                  disabled={a.loading}
                  onClick={() => { a.onRun(); setOpen(false); }}
                >
                  <Icon size={13} style={{ color: "var(--color-ink-60)", flexShrink: 0 }} />
                  {a.loading ? `${a.label}…` : a.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── types ────────────────────────────────────────────────────────────────────

type CandidateInteraction = {
  id: string;
  interaction_type: string;
  summary: string | null;
  full_notes: string | null;
  interacted_at: string;
  scheduled_at: string | null;
  is_future: boolean;
  client_id: string | null;
  contact_id: string | null;
  primary_party: string | null;
  clients: { id: string; company_name: string } | null;
  client_contacts: { id: string; name: string } | null;
};

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
          .select("*, notes_presentation, notes_personality, notes_pitch, notes_closing, notes_internal, address, date_of_birth, notes_template, notes_interview, urgency_notes, comp_notes, industry_preferences, location_preferences")
          .eq("id", id)
          .single(),
        supabase
          .from("candidate_motivations")
          .select("id, candidate_id, rank, motivation_text, motivation_type")
          .eq("candidate_id", id)
          .order("rank"),
        supabase
          .from("candidate_blockers")
          .select("id, candidate_id, theme, detail, is_risk")
          .eq("candidate_id", id),
        supabase
          .from("candidate_roles")
          .select("id, candidate_id, company_name, title, start_date, end_date, is_current, achievement_notes, reason_for_leaving_raw")
          .eq("candidate_id", id)
          .order("start_date", { ascending: true }),
        supabase
          .from("competing_interviews")
          .select("id, candidate_id, company_name, source, stage, disclosed_at, is_active")
          .eq("candidate_id", id)
          .order("disclosed_at", { ascending: false }),
        supabase
          .from("processes")
          .select(
            `
            id, stage, coverage_type, ai_snapshot, updated_at,
            buy_in_confirmed_at, not_interested_at, cv_sent_at, placed_date, last_activity_at,
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
          .select("id, recruiter_id, interaction_type, summary, full_notes, interacted_at, scheduled_at, is_future, client_id, contact_id, primary_party, clients(id, company_name), client_contacts(id, name)")
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
        interactions: (interactions ?? []) as CandidateInteraction[],
      };
    },
  });
}

// ─── component ───────────────────────────────────────────────────────────────

function CandidateProfile() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useCandidateProfile(id);
  const [page, setPage] = useState<"timeline" | "notes" | "processes" | "registration">("timeline");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function handleDeleteCandidate() {
    setDeleteBusy(true);
    await supabase.from("candidates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["candidates"] });
    toast.success("Candidate deleted.");
    void navigate({ to: "/candidates", search: { name: "", company: "", status: "", japanese_level: "", english_level: "", source: "", last_touch: "" } });
  }

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
      <div className="p-8 text-sm" style={{ color: "var(--color-ink-30)" }}>
        Candidate not found.
      </div>
    );
  }

  const { candidate: c, motivations, blockers, roles, competing, processes, interactions } = data;
  const lastContact = relativeTime(c.updated_at);
  const daysAgo = daysSince(c.updated_at);

  const headerAccent =
    c.candidate_status === "active"  ? "var(--color-vermillion)" :
    c.candidate_status === "placed"  ? "var(--color-indigo)" :
    c.candidate_status === "passive" ? "var(--color-gold)" :
    "var(--color-ink-15)";

  return (
    <div className="px-8 py-6 max-w-3xl">
      {/* Profile header */}
      <div
        className="flex items-start gap-5 mb-5 pl-4"
        style={{ borderLeft: `3px solid ${headerAccent}` }}
      >
        <div className="flex-1 min-w-0">
          <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Delete candidate</DialogTitle>
              </DialogHeader>
              <p className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
                Permanently delete <strong style={{ color: "var(--color-ink)" }}>{c.full_name}</strong>? This cannot be undone.
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Cancel</Button>
                <Button
                  disabled={deleteBusy}
                  onClick={() => void handleDeleteCandidate()}
                  style={{ background: "var(--color-danger)", color: "#fff", border: "none" }}
                >
                  {deleteBusy ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="text-[18px] font-medium font-display leading-snug">
            {c.full_name_japanese
              ? <>{c.full_name_japanese} / {c.full_name}</>
              : c.full_name}
          </div>
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--color-ink-60)" }}>
            {[c.current_title, c.current_company, c.age ? `Age ${c.age}` : null, c.address ?? null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {c.current_total && (
            <div className="mt-1 text-[12px]">
              <span style={{ color: "var(--color-ink)" }}>
                Current <strong>{formatYen(c.current_total)}</strong>
              </span>
            </div>
          )}
          {c.location_preferences && (
            <div className="mt-1 text-[12px] flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide shrink-0" style={{ color: "var(--color-ink-30)" }}>Preferred</span>
              <span style={{ color: "var(--color-ink-60)" }}>{c.location_preferences}</span>
            </div>
          )}
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: "var(--color-ink-30)" }}>
            Last contact:{" "}
            <span style={{ color: daysAgo > 14 ? "var(--color-danger)" : "var(--color-ink-60)" }}>
              {lastContact}
            </span>
          </div>
        </div>
        <button
          onClick={() => setDeleteOpen(true)}
          className="shrink-0 p-1 mt-0.5"
          style={{ color: "var(--color-ink-30)" }}
          title="Delete candidate"
        >
          <IconTrash size={14} />
        </button>
      </div>

      {/* Page tabs */}
      <div
        className="flex mb-4"
        style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        {(
          [
            { key: "timeline",     label: t('candidateDetail.tabs.timeline') },
            { key: "notes",        label: t('candidateDetail.tabs.notes') },
            { key: "processes",    label: t('candidateDetail.tabs.intelligence') },
            { key: "registration", label: t('candidateDetail.tabs.registration') },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className={`nav-tab text-[13px]${page === key ? " active" : ""}`}
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
          phone={c.phone}
          email={c.email}
          candidateName={c.full_name}
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
          candidate={c}
        />
      )}
    </div>
  );
}

// ─── registration page ────────────────────────────────────────────────────────

function RegistrationPage({
  candidateId,
  candidate: c,
}: {
  candidateId: string;
  candidate: Candidate;
}) {
  const { t } = useTranslation();
  const [cvExtracted, setCvExtracted] = useState<ExtractedCandidate | null>(null);
  const [regExtracted, setRegExtracted] = useState<ExtractedCandidate | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  function handleExtracted(source: "cv" | "reg", data: ExtractedCandidate) {
    if (source === "cv") setCvExtracted(data);
    else setRegExtracted(data);
    setReviewOpen(true);
  }

  return (
    <div className="space-y-3">
      {/* Registration form upload — primary document */}
      <RegistrationFormUploadZone
        candidateId={candidateId}
        teamId={c.team_id}
        registrationFormUrl={c.registration_form_url}
        onExtracted={(data) => handleExtracted("reg", data)}
      />

      {/* CV Upload — English CV, triggers AI extraction */}
      <CvUploadZone
        candidateId={candidateId}
        teamId={c.team_id}
        cvUrl={c.cv_url ?? null}
        onExtracted={(data) => handleExtracted("cv", data)}
      />

      {/* Japanese documents — storage only, no AI extraction */}
      <JpDocumentUploadZone
        candidateId={candidateId}
        teamId={c.team_id}
        fieldKey="cv_url_jp_shokumu"
        label={t('candidateDetail.documents.shokumukeirekisho')}
        sublabel={t('candidateDetail.documents.shokumukeirekishoLabel')}
        fileUrl={c.cv_url_jp_shokumu}
      />
      <JpDocumentUploadZone
        candidateId={candidateId}
        teamId={c.team_id}
        fieldKey="cv_url_jp_rireki"
        label={t('candidateDetail.documents.rirekisho')}
        sublabel={t('candidateDetail.documents.rirekishoLabel')}
        fileUrl={c.cv_url_jp_rireki}
      />

      {/* Auto-populated contact details */}
      <Card>
        <div className="flex items-center gap-1.5 mb-3">
          <SectionLabel className="mb-0">{t('candidateDetail.sections.candidateDetails')}</SectionLabel>
          <span className="text-[11px] px-1.5 py-0.5 " style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)" }}>
            auto-populated from form
          </span>
        </div>
        <div className="space-y-1">
          <RegistrationField label={t('candidateDetail.fields.fullName')} fieldKey="full_name" value={c.full_name} candidateId={candidateId} />
          <RegistrationField label={t('candidateDetail.fields.fullNameJapanese')} fieldKey="full_name_japanese" value={c.full_name_japanese} candidateId={candidateId} />
          <DobField candidateId={candidateId} dateOfBirth={c.date_of_birth} age={c.age} />
          <RegistrationField label={t('candidateDetail.fields.email')} fieldKey="email" value={c.email} candidateId={candidateId} inputType="email" placeholder="name@example.com" />
          <RegistrationField label={t('candidateDetail.fields.phone')} fieldKey="phone" value={c.phone} candidateId={candidateId} placeholder="+81 3 0000 0000" />
          <RegistrationField label={t('candidateDetail.fields.address')} fieldKey="address" value={c.address} candidateId={candidateId} placeholder="Tokyo, Minato-ku" />
          <RegistrationField label={t('candidateDetail.fields.linkedin')} fieldKey="linkedin_url" value={c.linkedin_url} candidateId={candidateId} placeholder="https://linkedin.com/in/…" />
        </div>
        <p className="mt-3 text-[11px] flex items-center gap-1" style={{ color: "var(--color-ink-30)" }}>
          <IconInfoCircle size={12} />
          Click any field to edit. Age is calculated automatically from date of birth.
        </p>
      </Card>

      {(cvExtracted || regExtracted) && (
        <ExtractionReviewModal
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          cvExtracted={cvExtracted}
          regExtracted={regExtracted}
          candidateId={candidateId}
          currentCandidate={c}
        />
      )}
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
        <span className="text-[12px] w-[150px] shrink-0" style={{ color: "var(--color-ink-30)" }}>{label}</span>
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
      className="flex items-center gap-3 py-1  cursor-pointer group"
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
    >
      <span className="text-[12px] w-[150px] shrink-0" style={{ color: "var(--color-ink-30)" }}>{label}</span>
      <span
        className="text-[13px] flex-1 px-1.5 py-0.5  group-hover:bg-[#f5f5f3] transition-colors"
        style={{ color: value ? "var(--color-ink)" : "var(--color-ink-30)" }}
      >
        {value || "—"}
      </span>
      <IconPencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "var(--color-ink-30)" }} />
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
  const { t } = useTranslation();
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
        <span className="text-[12px] w-[150px] shrink-0" style={{ color: "var(--color-ink-30)" }}>{t('candidateDetail.fields.dateOfBirth')}</span>
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
      className="flex items-center gap-3 py-1  cursor-pointer group"
      onClick={() => { setDraft(dateOfBirth ?? ""); setEditing(true); }}
    >
      <span className="text-[12px] w-[150px] shrink-0" style={{ color: "var(--color-ink-30)" }}>{t('candidateDetail.fields.dateOfBirth')}</span>
      <span
        className="text-[13px] flex-1 px-1.5 py-0.5  group-hover:bg-[#f5f5f3] transition-colors"
        style={{ color: displayDob ? "var(--color-ink)" : "var(--color-ink-30)" }}
      >
        {displayDob
          ? `${displayDob}${age != null ? ` (Age ${age})` : ""}`
          : "—"}
      </span>
      <IconPencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "var(--color-ink-30)" }} />
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
          <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--color-ink-30)" }}>
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
              <span className="text-[11px] font-normal" style={{ color: "var(--color-danger)" }}>
                Internal only
              </span>
            </Label>
            <Textarea
              placeholder="Raw context for your eyes only — never shared with clients"
              value={form.reason_for_leaving_raw}
              onChange={(e) => set("reason_for_leaving_raw", e.target.value)}
              className="min-h-[70px]"
              style={{ background: form.reason_for_leaving_raw ? "var(--color-danger-bg)" : undefined }}
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
            ? { background: "var(--color-moss-light)", borderColor: "rgba(39,80,10,0.25)" }
            : { background: "var(--color-indigo-light)", borderColor: "rgba(24,95,165,0.3)" }
        }
      />

      {/* Content */}
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[14px] font-medium">{role.company_name}</span>
        <span className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
          {startYear && endYear ? `${startYear} – ${endYear}` : ""}
          {durationYears ? ` · ${durationYears} year${durationYears !== 1 ? "s" : ""}` : ""}
        </span>
      </div>
      <div className="text-[12px] mb-2" style={{ color: "var(--color-ink-60)" }}>
        {role.title}
        {role.is_current && (
          <span
            className="ml-2 text-[10px] px-1.5 py-0.5 "
            style={{ background: "var(--color-moss-light)", color: "var(--color-moss)" }}
          >
            Current
          </span>
        )}
      </div>

      {role.achievement_notes && (
        <div
          className=" p-2.5 text-[13px] leading-relaxed mb-2"
          style={{ background: "var(--color-ink-10)" }}
        >
          {role.achievement_notes}
        </div>
      )}

      {role.reason_for_leaving_raw && (
        <>
          <p className="sl mb-1">Why {role.is_current ? "they want to leave" : "they left"}</p>
          {role.is_current && (
            <p className="text-[11px] mb-1" style={{ color: "var(--color-danger)" }}>
              Internal — not for client use
            </p>
          )}
          <div
            className=" p-2.5 text-[13px] leading-relaxed"
            style={{
              background: role.is_current ? "var(--color-danger-bg)" : "var(--color-ink-10)",
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
  const { t } = useTranslation();
  const qc = useQueryClient();

  type CandNotesPatch = Partial<Pick<Candidate,
    "current_company" | "current_title" | "notes_interview" | "notice_period_months" |
    "active_passive" | "urgency_notes" | "japanese_level" | "english_level" | "additional_languages" |
    "current_base" | "current_bonus" | "current_total" | "expected_total_min" |
    "expected_total_max" | "notes_presentation" | "comp_notes" |
    "industry_preferences" | "location_preferences"
  >>;

  async function saveField(field: string, value: string | number | null) {
    await supabase.from("candidates").update({ [field]: value } as CandNotesPatch).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
  }

  // source is `string | undefined` in generated types (Supabase quirk for nullable TEXT columns)
  // cast to unknown first so we can pass null to clear it
  async function saveSource(value: string | null) {
    await supabase.from("candidates").update({ source: value } as unknown as { source?: string }).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
  }

  const SOURCE_OPTIONS = [
    { value: "linkedin", label: "LinkedIn" },
    { value: "bizreach", label: "BizReach" },
    { value: "doda", label: "Doda" },
    { value: "referral", label: "Referral" },
    { value: "inbound", label: "Inbound" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-3 pb-8">
      {/* Source selector */}
      <Card>
        <SectionLabel>Candidate source</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map((opt) => {
            const active = c.source === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => void saveSource(active ? null : opt.value)}
                className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: active ? "var(--color-ink)" : "var(--color-ink-10)",
                  color: active ? "var(--color-white)" : "var(--color-ink-60)",
                  border: `0.5px solid ${active ? "var(--color-ink)" : "rgba(26,26,24,0.12)"}`,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Current Employment */}
      <Card>
        <SectionLabel>{t('candidateDetail.sections.currentEmployment')}</SectionLabel>
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

      {/* Interview Notes */}
      <InterviewNotesCard
        value={c.notes_interview}
        onSave={(v) => void saveField("notes_interview", v)}
      />

      {/* Location Preferences */}
      <Card>
        <SectionLabel>Location preferences</SectionLabel>
        <NoteField
          label=""
          value={c.location_preferences}
          placeholder="e.g. Tokyo preferred, ideally Shinjuku area or within 30min by train. Open to Yokohama. Not available for Osaka."
          onSave={(v) => void saveField("location_preferences", v)}
          rows={3}
        />
      </Card>

      {/* Industry Preferences */}
      <Card>
        <SectionLabel>Industry preferences</SectionLabel>
        <NoteField
          label=""
          value={c.industry_preferences}
          placeholder="e.g. Technology, Financial services, Consulting — open to foreign-affiliated companies in growth stage"
          onSave={(v) => void saveField("industry_preferences", v)}
          rows={3}
        />
      </Card>

      {/* Notice Period & Urgency */}
      <Card>
        <SectionLabel>{t('candidateDetail.sections.noticeAndUrgency')}</SectionLabel>
        <NoticeUrgencyFields
          noticePeriod={c.notice_period_months}
          activePassive={c.active_passive}
          urgencyNotes={c.urgency_notes}
          onSave={(field, value) => void saveField(field, value)}
        />
      </Card>

      {/* Language Assessment */}
      <Card>
        <SectionLabel>{t('candidateDetail.sections.languageAssessment')}</SectionLabel>
        <LanguageFields
          japanese={c.japanese_level}
          english={c.english_level}
          other={c.additional_languages ?? c.other_languages}
          onSave={(field, value) => void saveField(field, value)}
        />
      </Card>

      {/* Compensation */}
      <Card>
        <SectionLabel>{t('candidateDetail.sections.compensation')}</SectionLabel>
        <NoteCompensationFields
          candidate={c}
          onSave={(field, value) => void saveField(field, value)}
        />
      </Card>

      {/* Recruiter Assessment */}
      <Card>
        <SectionLabel>{t('candidateDetail.sections.recruiterAssessment')}</SectionLabel>
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

// ─── interview notes card with upload ────────────────────────────────────────

function InterviewNotesCard({
  value,
  onSave,
}: {
  value: string | null | undefined;
  onSave: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function handleBlur() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? "").trim()) onSave(trimmed || null);
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      let text = "";
      if (file.name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        text = result.value;
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const buf = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const resp = await fetch("/api/extract-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: base64 }),
        });
        const data = (await resp.json()) as { text?: string };
        text = data.text?.trim() ?? "";
      }
      if (!text || text.length < 20) { toast.error("Could not extract text from file."); return; }

      const resp = await fetch("/api/ai?type=format-interview-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text }),
      });
      const json = (await resp.json()) as { data?: string; error?: string };
      if (json.error) { toast.error("Could not format notes. Try again."); return; }
      if (json.data) {
        setAiResult(json.data);
        toast.success("Notes formatted — review and accept below.");
      }
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function acceptAi() {
    const combined = value ? `${value.trim()}\n\n${aiResult}` : aiResult!;
    onSave(combined);
    setAiResult(null);
    toast.success("Notes saved.");
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>{t('candidateDetail.sections.interviewNotes')}</SectionLabel>
        <button
          className="ab flex items-center gap-1"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <IconUpload size={10} />
          {uploading ? "Processing…" : "Upload doc"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
      </div>

      {/* AI result preview — shown before accepting */}
      {aiResult && (
        <div className="mb-3 p-3" style={{ background: "var(--color-indigo-light)", border: "0.5px solid #b5d4f4" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium" style={{ color: "var(--color-indigo)" }}>AI formatted — review before saving</span>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] font-medium px-2 py-0.5 "
                style={{ background: "var(--color-indigo)", color: "var(--color-white)" }}
                onClick={acceptAi}
              >
                Accept
              </button>
              <button onClick={() => setAiResult(null)}>
                <IconX size={12} style={{ color: "var(--color-indigo)" }} />
              </button>
            </div>
          </div>
          <textarea
            value={aiResult}
            onChange={(e) => setAiResult(e.target.value)}
            rows={8}
            className="w-full text-[12px] leading-relaxed resize-none bg-transparent outline-none"
            style={{ color: "var(--color-ink)" }}
          />
        </div>
      )}

      {/* Main notes field */}
      {editing ? (
        <div className="relative">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            rows={10}
            placeholder="Career history, transitions, achievements, background context from registration call…"
            className="w-full text-[13px] leading-relaxed px-3 py-2 resize-none"
            style={{ border: "0.5px solid var(--color-ink)", background: "var(--color-white)", color: "var(--color-ink)", outline: "none" }}
          />
          <button
            className="absolute bottom-2 right-2 flex items-center gap-1  px-2 py-1 text-[11px] font-medium"
            style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
            onMouseDown={(e) => { e.preventDefault(); handleBlur(); }}
          >
            <IconCheck size={10} /> Save
          </button>
        </div>
      ) : (
        <div
          className="px-3 py-2 cursor-text"
          style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", minHeight: "130px" }}
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        >
          {value ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink)" }}>{value}</p>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>Career history, transitions, achievements, background context from registration call…</p>
          )}
        </div>
      )}
    </Card>
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
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>{label}</p>
      )}
      {editing ? (
        <div className="relative">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && rows === 1) { e.preventDefault(); handleBlur(); } }}
            rows={rows}
            placeholder={placeholder}
            className="w-full text-[13px] leading-relaxed px-3 py-2 resize-none"
            style={{
              border: "0.5px solid var(--color-ink)",
              background: "var(--color-white)",
              color: "var(--color-ink)",
              outline: "none",
            }}
          />
          <button
            className="absolute bottom-2 right-2 flex items-center gap-1  px-2 py-1 text-[11px] font-medium"
            style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
            onMouseDown={(e) => { e.preventDefault(); handleBlur(); }}
          >
            <IconCheck size={10} /> Save
          </button>
        </div>
      ) : (
        <div
          className="px-3 py-2 cursor-text"
          style={{
            border: "0.5px solid var(--color-ink-15)",
            background: "var(--color-ink-10)",
            minHeight: rows > 3 ? `${rows * 1.65 * 13}px` : "36px",
          }}
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        >
          {value ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink)" }}>{value}</p>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── notice period & urgency inline fields ────────────────────────────────────

function NoticeUrgencyFields({
  noticePeriod,
  activePassive,
  urgencyNotes,
  onSave,
}: {
  noticePeriod: number | null;
  activePassive: string | null;
  urgencyNotes: string | null;
  onSave: (field: string, value: string | number | null) => void;
}) {
  const [editingNotice, setEditingNotice] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState(noticePeriod != null ? String(noticePeriod) : "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(urgencyNotes ?? "");

  function saveNotice() {
    setEditingNotice(false);
    const v = noticeDraft.trim() ? Number(noticeDraft) : null;
    if (v !== noticePeriod) onSave("notice_period_months", v);
  }

  function saveNotes() {
    setEditingNotes(false);
    const trimmed = notesDraft.trim();
    if (trimmed !== (urgencyNotes ?? "").trim()) onSave("urgency_notes", trimmed || null);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Notice period */}
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Notice period</p>
          {editingNotice ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                autoFocus
                value={noticeDraft}
                onChange={(e) => setNoticeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNotice();
                  if (e.key === "Escape") { setNoticeDraft(noticePeriod != null ? String(noticePeriod) : ""); setEditingNotice(false); }
                }}
                className="h-[36px] w-16 px-3 text-[13px] outline-none"
                style={{ border: "0.5px solid var(--color-ink)", background: "var(--color-white)", color: "var(--color-ink)" }}
                placeholder="3"
              />
              <span className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>months</span>
              <button
                className="flex items-center gap-1  px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
                onMouseDown={(e) => { e.preventDefault(); saveNotice(); }}
              >
                <IconCheck size={10} />
              </button>
            </div>
          ) : (
            <div
              className="px-3 py-2 cursor-text"
              style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", minHeight: "36px" }}
              onClick={() => { setNoticeDraft(noticePeriod != null ? String(noticePeriod) : ""); setEditingNotice(true); }}
            >
              <span className="text-[13px]" style={{ color: noticePeriod != null ? "var(--color-ink)" : "var(--color-ink-30)" }}>
                {noticePeriod != null ? `${noticePeriod} month${noticePeriod !== 1 ? "s" : ""}` : "e.g. 3 months"}
              </span>
            </div>
          )}
        </div>

        {/* Active / Passive */}
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Urgency to move</p>
          <div className="flex gap-2">
            {(["Active", "Passive"] as const).map((opt) => {
              const selected = activePassive === opt;
              return (
                <button
                  key={opt}
                  onClick={() => onSave("active_passive", selected ? null : opt)}
                  className="flex-1 h-[36px] text-[13px] font-medium transition-colors"
                  style={{
                    background: selected ? "var(--color-ink)" : "var(--color-ink-10)",
                    color: selected ? "var(--color-white)" : "var(--color-ink-60)",
                    border: `0.5px solid ${selected ? "var(--color-ink)" : "rgba(26,26,24,0.12)"}`,
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Urgency notes */}
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Urgency notes</p>
        {editingNotes ? (
          <div className="relative">
            <textarea
              autoFocus
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Why they are active, when a passive candidate might start looking, timeline context…"
              className="w-full text-[13px] leading-relaxed px-3 py-2 resize-none"
              style={{ border: "0.5px solid var(--color-ink)", background: "var(--color-white)", color: "var(--color-ink)", outline: "none" }}
            />
            <button
              className="absolute bottom-2 right-2 flex items-center gap-1  px-2 py-1 text-[11px] font-medium"
              style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
              onMouseDown={(e) => { e.preventDefault(); saveNotes(); }}
            >
              <IconCheck size={10} /> Save
            </button>
          </div>
        ) : (
          <div
            className="px-3 py-2 cursor-text"
            style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", minHeight: "36px" }}
            onClick={() => { setNotesDraft(urgencyNotes ?? ""); setEditingNotes(true); }}
          >
            {urgencyNotes ? (
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink)" }}>{urgencyNotes}</p>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>Why they are active, or when they might start looking…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── language fields ─────────────────────────────────────────────────────────

const JAPANESE_LEVELS = ["Native", "Fluent", "High Business", "Business", "Low Business", "High Conversational", "Conversational", "Low Conversational", "Basic", "None"] as const;
const ENGLISH_LEVELS = ["Native", "Fluent", "High Business", "Business", "Low Business", "High Conversational", "Conversational", "Low Conversational", "Basic", "None"] as const;

const PROFICIENCY_LEVELS = ["Native", "Fluent", "High Business", "Business", "Low Business", "High Conversational", "Conversational", "Low Conversational", "Basic"] as const;

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
  // Parse saved "Korean — Business" format into parts
  const parsedOtherLang = other?.split(" — ")[0]?.trim() ?? "";
  const parsedOtherLevel = other?.split(" — ")[1]?.trim() ?? "";

  const [langName, setLangName] = useState(parsedOtherLang);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [editingName, setEditingName] = useState(false);

  // Sync if prop changes (e.g. after save)
  useEffect(() => {
    setLangName(other?.split(" — ")[0]?.trim() ?? "");
  }, [other]);

  function handleLangKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && langName.trim()) {
      setEditingName(false);
      setShowLevelPicker(true);
    }
    if (e.key === "Escape") { setLangName(parsedOtherLang); setEditingName(false); }
  }

  function selectLevel(level: string) {
    setShowLevelPicker(false);
    const saved = langName.trim() ? `${langName.trim()} — ${level}` : null;
    onSave("additional_languages", saved);
  }

  function clearOther() {
    setLangName("");
    setShowLevelPicker(false);
    onSave("additional_languages", null);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Japanese</p>
          <Select value={japanese ?? "__none__"} onValueChange={(v) => onSave("japanese_level", v === "__none__" ? null : v)}>
            <SelectTrigger className="h-[36px] text-[13px]" style={{ background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)" }}>
              <SelectValue placeholder="Select level…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not specified</SelectItem>
              {JAPANESE_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>English</p>
          <Select value={english ?? "__none__"} onValueChange={(v) => onSave("english_level", v === "__none__" ? null : v)}>
            <SelectTrigger className="h-[36px] text-[13px]" style={{ background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)" }}>
              <SelectValue placeholder="Select level…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not specified</SelectItem>
              {ENGLISH_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Other language — type name then pick proficiency */}
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Other languages</p>

        {/* Display saved value */}
        {other && !editingName && !showLevelPicker ? (
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", minHeight: "36px" }}
          >
            <span className="text-[13px]" style={{ color: "var(--color-ink)" }}>{other}</span>
            <div className="flex items-center gap-2">
              <button
                className="text-[11px]"
                style={{ color: "var(--color-ink-30)" }}
                onClick={() => { setLangName(parsedOtherLang); setShowLevelPicker(true); }}
              >
                Change level
              </button>
              <button onClick={clearOther}>
                <IconX size={12} style={{ color: "var(--color-ink-30)" }} />
              </button>
            </div>
          </div>
        ) : showLevelPicker ? (
          /* Step 2: pick proficiency */
          <div className="overflow-hidden" style={{ border: "0.5px solid rgba(26,26,24,0.16)", background: "var(--color-white)" }}>
            <div className="px-3 py-2 text-[12px] font-medium" style={{ background: "var(--color-ink-10)", color: "var(--color-ink-60)" }}>
              {langName} — select proficiency
            </div>
            <div className="grid grid-cols-3 gap-0">
              {PROFICIENCY_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => selectLevel(level)}
                  className="px-2 py-2 text-[12px] text-left transition-colors"
                  style={{
                    color: parsedOtherLevel === level ? "var(--color-indigo)" : "var(--color-ink)",
                    background: parsedOtherLevel === level ? "var(--color-indigo-light)" : "transparent",
                    borderBottom: "0.5px solid rgba(26,26,24,0.06)",
                  }}
                  onMouseEnter={(e) => { if (parsedOtherLevel !== level) e.currentTarget.style.background = "var(--color-ink-10)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = parsedOtherLevel === level ? "var(--color-indigo-light)" : "transparent"; }}
                >
                  {level}
                </button>
              ))}
            </div>
            <button
              className="w-full text-left px-3 py-2 text-[11px]"
              style={{ color: "var(--color-ink-30)", borderTop: "0.5px solid rgba(26,26,24,0.08)" }}
              onClick={() => { setShowLevelPicker(false); setEditingName(false); }}
            >
              Cancel
            </button>
          </div>
        ) : (
          /* Step 1: type language name */
          <div className="flex items-center gap-2">
            <input
              autoFocus={editingName}
              value={langName}
              onChange={(e) => setLangName(e.target.value)}
              onFocus={() => setEditingName(true)}
              onKeyDown={handleLangKeyDown}
              placeholder="e.g. Korean, Mandarin…"
              className="flex-1 h-[36px] px-3 text-[13px] outline-none"
              style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", color: "var(--color-ink)" }}
            />
            {langName.trim() && (
              <button
                className="flex items-center gap-1 px-3 h-[36px] text-[12px] font-medium shrink-0"
                style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
                onClick={() => { setEditingName(false); setShowLevelPicker(true); }}
              >
                <IconCheck size={11} /> Set level
              </button>
            )}
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
  onSave: (field: string, value: number | string | null) => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(c.comp_notes ?? "");
  const [overrideTotal, setOverrideTotal] = useState(false);

  function saveNotes() {
    setEditingNotes(false);
    const trimmed = notesDraft.trim();
    if (trimmed !== (c.comp_notes ?? "").trim()) onSave("comp_notes", trimmed || null);
  }

  function restoreAutoTotal() {
    setOverrideTotal(false);
    onSave("current_total", (c.current_base ?? 0) + (c.current_bonus ?? 0));
  }

  function YenField({
    label,
    fieldKey,
    value,
  }: {
    label: string;
    fieldKey: string;
    value: number | null;
  }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value != null ? String(value / 1_000_000) : "");

    // Keep draft in sync if value changes (e.g. auto-calc update)
    useEffect(() => {
      if (!editing) setDraft(value != null ? String(value / 1_000_000) : "");
    }, [value, editing]);

    function save() {
      setEditing(false);
      const parsed = draft.trim() ? Math.round(Number(draft) * 1_000_000) : null;
      if (parsed === value) return;
      onSave(fieldKey, parsed);

      // Auto-calc current_total when base or bonus changes, unless recruiter has overridden it
      if (!overrideTotal && (fieldKey === "current_base" || fieldKey === "current_bonus")) {
        const base = fieldKey === "current_base" ? parsed : c.current_base;
        const bonus = fieldKey === "current_bonus" ? parsed : c.current_bonus;
        onSave("current_total", (base ?? 0) + (bonus ?? 0));
      }
    }

    return (
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>{label}</p>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium shrink-0" style={{ color: "var(--color-ink-60)" }}>¥</span>
            <input
              autoFocus
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { setDraft(value != null ? String(value / 1_000_000) : ""); setEditing(false); }
              }}
              className="flex-1 h-[36px] px-2 text-[13px] outline-none min-w-0"
              style={{ border: "0.5px solid var(--color-ink)", background: "var(--color-white)", color: "var(--color-ink)" }}
              placeholder="12"
            />
            <span className="text-[12px] shrink-0" style={{ color: "var(--color-ink-30)" }}>M</span>
            <button
              className="flex items-center gap-0.5  px-2 h-[36px] text-[11px] font-medium shrink-0"
              style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
              onMouseDown={(e) => { e.preventDefault(); save(); }}
            >
              <IconCheck size={10} />
            </button>
          </div>
        ) : (
          <div
            className="px-3 py-2 cursor-text"
            style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", minHeight: "36px" }}
            onClick={() => { setDraft(value != null ? String(value / 1_000_000) : ""); setEditing(true); }}
          >
            <span className="text-[13px]" style={{ color: value != null ? "var(--color-ink)" : "var(--color-ink-30)" }}>
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
        {overrideTotal ? (
          <div>
            <YenField label="Current total" fieldKey="current_total" value={c.current_total} />
            <p className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-30)" }}>
              Manual —{" "}
              <button
                onClick={restoreAutoTotal}
                className="underline"
                style={{ color: "var(--color-ink-30)" }}
              >
                Auto
              </button>
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Current total</p>
            <div
              className="px-3 py-2"
              style={{ border: "0.5px solid var(--color-border-subtle)", background: "var(--color-ink-10)", minHeight: "36px" }}
            >
              <span className="text-[13px]" style={{ color: c.current_total != null ? "var(--color-ink)" : "var(--color-ink-30)" }}>
                {c.current_total != null ? formatYen(c.current_total) : "—"}
              </span>
            </div>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-30)" }}>
              Auto-calculated —{" "}
              <button
                onClick={() => setOverrideTotal(true)}
                className="underline"
                style={{ color: "var(--color-ink-30)" }}
              >
                Override
              </button>
            </p>
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Expected range</p>
        <div className="grid grid-cols-2 gap-3">
          <YenField label="Min" fieldKey="expected_total_min" value={c.expected_total_min} />
          <YenField label="Max" fieldKey="expected_total_max" value={c.expected_total_max} />
        </div>
      </div>

      {/* Free-text compensation notes */}
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-ink-60)" }}>Compensation notes</p>
        {editingNotes ? (
          <div className="relative">
            <textarea
              autoFocus
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Current/expected comp context, bonus structure details, equity, strong base preference…"
              className="w-full text-[13px] leading-relaxed px-3 py-2 resize-none"
              style={{ border: "0.5px solid var(--color-ink)", background: "var(--color-white)", color: "var(--color-ink)", outline: "none" }}
            />
            <button
              className="absolute bottom-2 right-2 flex items-center gap-1  px-2 py-1 text-[11px] font-medium"
              style={{ background: "var(--color-ink)", color: "var(--color-white)" }}
              onMouseDown={(e) => { e.preventDefault(); saveNotes(); }}
            >
              <IconCheck size={10} /> Save
            </button>
          </div>
        ) : (
          <div
            className="px-3 py-2 cursor-text"
            style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-10)", minHeight: "36px" }}
            onClick={() => { setNotesDraft(c.comp_notes ?? ""); setEditingNotes(true); }}
          >
            {c.comp_notes ? (
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink)" }}>{c.comp_notes}</p>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>Bonus structure, equity, strong base preference, flex details…</p>
            )}
          </div>
        )}
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
      const res = await fetch("/api/ai?type=extract-compensation", {
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
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-ink-60)" }}>
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
        <div className="flex items-center gap-3 flex-wrap text-[11px]" style={{ color: "var(--color-ink-60)" }}>
          <TabLegend color="#c0dd97" border="#3B6D11" label="Your req" />
          <TabLegend color="#d3d1c7" border="var(--color-ink-30)" label="Colleague's req" />
          <TabLegend color="#f7c1c1" border="var(--color-danger)" label="Not covered by your firm" />
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

// ─── situation banner ─────────────────────────────────────────────────────────

function SituationBanner({
  process: p,
  candidateFirstName,
  onGenerateInterviewPrep,
  onGenerateRejection,
  onCloseProcess,
  loadingPrep,
  loadingRejection,
  closingProcess,
}: {
  process: Process;
  candidateFirstName: string;
  onGenerateInterviewPrep?: () => void;
  onGenerateRejection?: () => void;
  onCloseProcess?: () => void;
  loadingPrep?: boolean;
  loadingRejection?: boolean;
  closingProcess?: boolean;
}) {
  const clientName = p.requisitions?.clients?.company_name ?? "the client";
  const ccmMatch = /^CCM(\d+)$/.exec(p.stage);
  const ccmNumber = ccmMatch ? parseInt(ccmMatch[1], 10) : null;
  const outcome = p.ccm_outcome;

  let bg = "var(--color-ink-10)";
  let border = "var(--color-ink-15)";
  let textColor = "var(--color-ink-60)";
  let situation = "";
  let actions: React.ReactNode = null;

  if (p.stage === "Specs Sent") {
    situation = `Get buy-in from ${candidateFirstName} before submitting to ${clientName}. Send the spec and confirm interest.`;
  } else if (p.stage === "CV Sent") {
    const daysSent = p.cv_sent_at ? Math.floor((Date.now() - new Date(p.cv_sent_at).getTime()) / 86_400_000) : null;
    situation = `CV submitted to ${clientName}${daysSent !== null ? ` ${daysSent} day${daysSent === 1 ? "" : "s"} ago` : ""}. Chase for feedback if no response within 5 business days.`;
    bg = "var(--color-gold-light)";
    border = "rgba(184,146,42,0.3)";
    textColor = "var(--color-gold)";
  } else if (ccmNumber !== null) {
    if (outcome === "pass") {
      situation = `Green light from ${clientName} on CCM${ccmNumber}. Prep ${candidateFirstName} for CCM${ccmNumber + 1}.`;
      bg = "var(--color-moss-light)";
      border = "rgba(74,94,58,0.3)";
      textColor = "#3b6d11";
      actions = onGenerateInterviewPrep ? (
        <button
          className="text-[11px] px-2.5 py-1 font-medium shrink-0"
          style={{ background: "var(--color-moss)", color: "var(--color-white)", border: "none" }}
          onClick={onGenerateInterviewPrep}
          disabled={loadingPrep}
        >
          {loadingPrep ? "Generating…" : `CCM${ccmNumber + 1} prep`}
        </button>
      ) : null;
    } else if (outcome === "fail") {
      situation = `${clientName} declined after CCM${ccmNumber}. Send a soft rejection to ${candidateFirstName} and close this process.`;
      bg = "#fcebeb";
      border = "rgba(163,45,45,0.25)";
      textColor = "#a32d2d";
      actions = (
        <div className="flex items-center gap-2 shrink-0">
          {onGenerateRejection && (
            <button
              className="text-[11px] px-2.5 py-1 font-medium"
              style={{ background: "#a32d2d", color: "var(--color-white)", border: "none" }}
              onClick={onGenerateRejection}
              disabled={loadingRejection}
            >
              {loadingRejection ? "Generating…" : "Rejection email"}
            </button>
          )}
          {onCloseProcess && (
            <button
              className="text-[11px] px-2.5 py-1 font-medium"
              style={{ background: "var(--color-white)", color: "#a32d2d", border: "0.5px solid rgba(163,45,45,0.4)" }}
              onClick={onCloseProcess}
              disabled={closingProcess}
            >
              {closingProcess ? "Closing…" : "Close process"}
            </button>
          )}
        </div>
      );
    } else {
      situation = `CCM${ccmNumber} completed. Chase ${clientName} for feedback — record the outcome above before the conversation goes cold.`;
      bg = "var(--color-indigo-light)";
      border = "rgba(44,62,107,0.25)";
      textColor = "var(--color-indigo)";
    }
  }

  if (!situation) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 mb-4"
      style={{ background: bg, border: `0.5px solid ${border}` }}
    >
      <p className="text-[12px] leading-snug flex-1" style={{ color: textColor }}>{situation}</p>
      {actions}
    </div>
  );
}

// ─── process panel (white regardless of tab color) ───────────────────────────

const PIPELINE_STAGES = [
  "Specs Sent", "Buy-In", "CV Sent", "CCM1", "CCM2", "CCM3", "CCM4",
  "Offer", "Placed", "Closed lost",
] as const;

function stageMilestoneToast(newStage: string, candidateName?: string) {
  const ccmMatch = /^CCM(\d+)$/.exec(newStage);
  if (newStage === "Buy-In") {
    toast.success("Buy-in confirmed.", { description: "CV can now be submitted to the client." });
  } else if (newStage === "CV Sent") {
    toast.success("CV submitted.", { description: "Track client response — follow up in 3 days if no reply." });
  } else if (ccmMatch) {
    const n = ccmMatch[1];
    const ordinal = n === "1" ? "First" : n === "2" ? "Second" : n === "3" ? "Third" : `${n}th`;
    toast.success(`${ordinal} interview confirmed.`, { description: "Pipeline is moving. Prepare the candidate." });
  } else if (newStage === "Offer") {
    toast.success("Offer stage reached.", { description: "Prepare the offer package and brief the candidate.", duration: 6000 });
  } else if (newStage === "Placed") {
    toast.success(`${candidateName ? `${candidateName} is placed.` : "Placement confirmed."}`, {
      description: "Deal done. Start the guarantee clock and request referrals.",
      duration: 10000,
    });
  } else {
    toast.success(`Stage updated to ${newStage}.`);
  }
}

function useStageChange(candidateId: string, opts?: { candidateName?: string; onAdvanced?: () => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ process, newStage }: { process: Process; newStage: string }) => {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      // Guard: advancing CCMn → CCMn+1 requires pass feedback AND the next CCM scheduled
      const currentCcmMatch = /^CCM(\d+)$/.exec(process.stage);
      const newCcmMatch = /^CCM(\d+)$/.exec(newStage);
      if (currentCcmMatch && newCcmMatch) {
        const currentNum = parseInt(currentCcmMatch[1], 10);
        const newNum = parseInt(newCcmMatch[1], 10);
        if (newNum === currentNum + 1) {
          if (process.ccm_outcome !== "pass") {
            throw new Error(`Set CCM${currentNum} feedback to "Pass" before advancing to CCM${newNum}.`);
          }
          const { data: scheduled } = await supabase
            .from("interactions")
            .select("id")
            .eq("candidate_id", candidateId)
            .eq("is_future", true)
            .ilike("interaction_type", `ccm${newNum}`)
            .limit(1);
          if (!scheduled?.length) {
            throw new Error(`Log an upcoming CCM${newNum} in the activity timeline before advancing.`);
          }
        }
      }

      type ProcessPatch = {
        stage: string;
        last_activity_at: string;
        buy_in_confirmed_at?: string;
        cv_sent_at?: string;
        placed_date?: string;
        ccm_outcome?: null;
        ccm_feedback_notes?: null;
        ccm_feedback_at?: null;
      };
      const patch: ProcessPatch = { stage: newStage, last_activity_at: now };

      if (newStage === "Buy-In" && !process.buy_in_confirmed_at) patch.buy_in_confirmed_at = now;
      if (newStage === "CV Sent" && !process.cv_sent_at) patch.cv_sent_at = now;
      if (newStage === "Placed") patch.placed_date = today;

      // Clear CCM feedback when advancing to the next round so it starts as pending
      if (currentCcmMatch && newCcmMatch && parseInt(newCcmMatch[1], 10) === parseInt(currentCcmMatch[1], 10) + 1) {
        patch.ccm_outcome = null;
        patch.ccm_feedback_notes = null;
        patch.ccm_feedback_at = null;
      }

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
      stageMilestoneToast(newStage, opts?.candidateName);
      opts?.onAdvanced?.();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update stage. Try again."),
  });
}

// ─── pipeline progress strip ──────────────────────────────────────────────────

const PROGRESS_NODES = [
  { key: "Specs Sent", label: "Specs" },
  { key: "Buy-In",    label: "Buy-In" },
  { key: "CV Sent",   label: "CV Sent" },
  { key: "ccm",       label: "Interview" },
  { key: "Offer",     label: "Offer" },
  { key: "Placed",    label: "Placed" },
] as const;

function PipelineProgressStrip({ stage, justAdvanced }: { stage: string; justAdvanced: boolean }) {
  const isCcm = /^CCM\d+$/.test(stage);
  const ccmNum = isCcm ? stage.replace("CCM", "") : null;
  const isClosedLost = stage === "Closed lost";

  function nodeStatus(key: string): "done" | "active" | "future" {
    const stageOrder: Record<string, number> = {
      "Specs Sent": 0, "Buy-In": 1, "CV Sent": 2, ccm: 3, "Offer": 4, "Placed": 5,
    };
    const currentKey = isCcm ? "ccm" : stage;
    const currentOrder = stageOrder[currentKey] ?? -1;
    const nodeOrder = stageOrder[key] ?? 99;
    if (isClosedLost) return "done"; // all grey for closed
    if (nodeOrder < currentOrder) return "done";
    if (nodeOrder === currentOrder) return "active";
    return "future";
  }

  return (
    <div className="flex items-center gap-0 mb-4">
      {PROGRESS_NODES.map((node, i) => {
        const status = nodeStatus(node.key);
        const isActive = status === "active";
        const isDone = status === "done";
        const isLast = i === PROGRESS_NODES.length - 1;

        const nodeColor = isClosedLost
          ? "var(--color-ink-15)"
          : isDone
            ? "var(--color-ink)"
            : isActive
              ? "var(--color-vermillion)"
              : "var(--color-ink-15)";

        const labelColor = isActive
          ? "var(--color-vermillion)"
          : isDone
            ? "var(--color-ink-60)"
            : "var(--color-ink-30)";

        return (
          <div key={node.key} className="flex items-center" style={{ flex: isLast ? "0 0 auto" : 1 }}>
            {/* Node */}
            <div className="flex flex-col items-center gap-[3px]">
              <div
                className={isActive && justAdvanced ? "stage-advance" : ""}
                style={{
                  width: 7,
                  height: 7,
                  background: nodeColor,
                  flexShrink: 0,
                }}
              />
              <span
                className="text-[9px] font-mono uppercase tracking-[0.06em] whitespace-nowrap"
                style={{ color: labelColor }}
              >
                {node.key === "ccm" && ccmNum ? `CCM${ccmNum}` : node.label}
              </span>
            </div>
            {/* Connector line */}
            {!isLast && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  marginBottom: 14,
                  background: isDone ? "var(--color-ink-60)" : "var(--color-ink-15)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [justAdvanced, setJustAdvanced] = useState(false);
  const stageChange = useStageChange(c.id, {
    candidateName: c.full_name,
    onAdvanced: () => {
      setJustAdvanced(true);
      setTimeout(() => setJustAdvanced(false), 700);
    },
  });

  return (
    <div
      className="rounded-b-xl p-5"
      style={{
        background: "var(--color-white)",
        border: "0.5px solid var(--color-ink-15)",
      }}
    >
      {/* Pipeline progress strip */}
      {p.stage !== "Closed lost" && (
        <PipelineProgressStrip stage={p.stage} justAdvanced={justAdvanced} />
      )}

      {/* Panel header */}
      <div
        className="flex items-center justify-between mb-4 pb-2.5 text-[12px]"
        style={{ borderBottom: "0.5px solid var(--color-ink-15)", color: "var(--color-ink-60)" }}
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
          className="text-[11px] font-medium  px-2 py-0.5 outline-none cursor-pointer"
          style={{ border: "0.5px solid rgba(26,26,24,0.16)", color: "var(--color-ink)", background: "var(--color-ink-10)" }}
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
  const { t } = useTranslation();
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
  const [loadingRejection, setLoadingRejection] = useState(false);
  const [rejectionEmail, setRejectionEmail] = useState<string | null>(null);
  const [closingProcess, setClosingProcess] = useState(false);
  const [sendDialog, setSendDialog] = useState<{ body: string; to: string; subject: string; candidateId?: string } | null>(null);
  const stageChange = useStageChange(c.id, { candidateName: c.full_name });

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
      const resp = await fetch("/api/ai?type=positioning", {
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
      const resp = await fetch("/api/ai?type=pre-call-briefing", {
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
      const resp = await fetch("/api/ai?type=submission-note", {
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
      const resp = await fetch("/api/ai?type=interview-prep", {
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
      const resp = await fetch("/api/ai?type=spec-email", {
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

  async function generateRejectionEmail() {
    setLoadingRejection(true);
    try {
      const resp = await fetch("/api/ai?type=rejection-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_id: p.id, candidate_id: c.id }),
      });
      const json = await resp.json() as { email?: string; error?: string };
      if (json.error) { toast.error("Could not generate rejection email. Try again."); return; }
      if (json.email) setRejectionEmail(json.email);
    } catch {
      toast.error("Could not generate rejection email. Try again.");
    } finally {
      setLoadingRejection(false);
    }
  }

  async function handleCloseProcess() {
    if (!confirm("Close this process and mark as 'Closed lost'? This cannot be undone easily.")) return;
    setClosingProcess(true);
    try {
      await stageChange.mutateAsync({ process: p, newStage: "Closed lost" });
    } finally {
      setClosingProcess(false);
    }
  }

  const watchOuts = blockers.filter((b) => b.is_risk);
  const candidateFirstName = c.full_name.split(" ")[0];

  return (
    <div>
      {/* Situation banner — stage-aware opinionated brief */}
      <SituationBanner
        process={p}
        candidateFirstName={candidateFirstName}
        onGenerateInterviewPrep={ccmNumber !== null ? generateInterviewPrep : undefined}
        onGenerateRejection={generateRejectionEmail}
        onCloseProcess={handleCloseProcess}
        loadingPrep={loadingInterviewPrep}
        loadingRejection={loadingRejection}
        closingProcess={closingProcess}
      />

      {/* Two-column: motivations + watch-outs */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <SectionLabel>Top motivations for this role</SectionLabel>
          {motivations.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No motivations recorded.</p>
          ) : (
            motivations.map((m) => (
              <div key={m.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span
                  className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: "var(--color-ink-30)" }}
                />
                <span>{m.motivation_text}</span>
              </div>
            ))
          )}
        </div>

        <div>
          <SectionLabel>Watch out for</SectionLabel>
          {watchOuts.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No risk flags recorded.</p>
          ) : (
            watchOuts.map((b) => (
              <div key={b.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span
                  className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: "var(--color-gold)" }}
                />
                <span>
                  <strong>{b.theme}.</strong>{" "}
                  <span style={{ color: "var(--color-ink-60)" }}>{b.detail}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CCM feedback — only shown for CCM stages */}
      {ccmNumber !== null && (
        <div className="mb-4  p-4" style={{ background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)" }}>
          <SectionLabel>CCM{ccmNumber} client feedback</SectionLabel>
          <div className="flex gap-2 mb-3">
            {(["pass", "pending", "fail"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setFeedbackOutcome(opt)}
                className="text-[12px] px-3 py-1  font-medium transition-colors"
                style={{
                  background: feedbackOutcome === opt
                    ? opt === "pass" ? "var(--color-moss-light)" : opt === "fail" ? "var(--color-danger-bg)" : "var(--color-gold-light)"
                    : "var(--color-white)",
                  color: feedbackOutcome === opt
                    ? opt === "pass" ? "var(--color-moss)" : opt === "fail" ? "var(--color-danger)" : "var(--color-gold)"
                    : "var(--color-ink-30)",
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
            className="w-full  p-3 text-[12px] leading-relaxed resize-none outline-none mb-2"
            style={{ background: "var(--color-white)", border: "0.5px solid rgba(26,26,24,0.16)", color: "var(--color-ink)" }}
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
            <span className="text-[11px] ml-2" style={{ color: "var(--color-ink-30)" }}>
              Last saved {relativeTime(p.ccm_feedback_at)}
            </span>
          )}
        </div>
      )}

      {/* Rejection email output */}
      {rejectionEmail !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="sl" style={{ color: "#a32d2d" }}>Rejection email</p>
            <button onClick={() => setRejectionEmail(null)} className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>Dismiss</button>
          </div>
          <textarea
            value={rejectionEmail}
            onChange={(e) => setRejectionEmail(e.target.value)}
            rows={10}
            className="w-full p-3 text-[13px] leading-relaxed resize-y outline-none"
            style={{ background: "#fcebeb", border: "0.5px solid rgba(163,45,45,0.25)", color: "var(--color-ink)" }}
          />
          <div className="flex gap-2 mt-1.5">
            <button
              className="ab flex items-center gap-1"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => { void navigator.clipboard.writeText(rejectionEmail); toast.success("Copied."); }}
            >
              <IconCopy size={10} /> Copy
            </button>
            <button
              className="btn btn-accent btn-sm flex items-center gap-1"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => setSendDialog({ body: rejectionEmail, to: c.email ?? "", subject: `Update from ${p.requisitions?.clients?.company_name ?? "us"}`, candidateId: c.id })}
            >
              <IconSend size={10} /> Send
            </button>
          </div>
        </div>
      )}

      {/* Positioning talking points — NFAR blocks */}
      <SectionLabel>{t('candidateDetail.intelligence.positioningPoints')}</SectionLabel>
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
            className=" p-3 text-[13px] mb-3"
            style={{ background: "var(--color-ink-10)", border: "0.5px dashed rgba(26,26,24,0.22)" }}
          >
            <span style={{ color: "var(--color-ink-30)" }}>No positioning points yet. </span>
            <button
              onClick={generatePositioning}
              disabled={loadingPositioning}
              className="underline underline-offset-2"
              style={{ color: "var(--color-indigo)" }}
            >
              {loadingPositioning ? "Generating…" : "Generate with AI"}
            </button>
          </div>
        );
      })()}

      {/* AI Toolbox */}
      <AIToolbox
        actions={[
          { key: "briefing", label: "Pre-call briefing", icon: IconPhone, loading: loadingBriefing, onRun: generateBriefing },
          { key: "positioning", label: "Refresh talking points", icon: IconSparkles, loading: loadingPositioning, onRun: generatePositioning },
          { key: "submission", label: "Submission note", icon: IconFileText, loading: loadingSubmission, onRun: generateSubmissionNote },
          ...(ccmNumber !== null ? [{ key: "prep", label: `Interview prep (CCM${ccmNumber})`, icon: IconClipboard, loading: loadingInterviewPrep, onRun: generateInterviewPrep }] : []),
          ...(p.stage === "Specs Sent" ? [{ key: "specemail", label: "Spec email", icon: IconMail, loading: loadingSpecEmail, onRun: generateSpecEmail }] : []),
          ...(p.ccm_outcome === "fail" ? [{ key: "rejection", label: "Rejection email", icon: IconMail, loading: loadingRejection, onRun: generateRejectionEmail }] : []),
        ]}
      />

      {/* Pre-call briefing output */}
      {briefing && (
        <div
          className="mt-4  p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
          style={{
            background: "var(--color-indigo-light)",
            border: "0.5px solid rgba(24,95,165,0.3)",
          }}
        >
          <p className="sl mb-2" style={{ color: "var(--color-indigo)" }}>Pre-call briefing</p>
          {briefing}
        </div>
      )}

      {/* Spec email output */}
      {specEmail && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="sl" style={{ color: "var(--color-indigo)" }}>Spec email</p>
            <button onClick={() => setSpecEmail(null)} className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>Dismiss</button>
          </div>
          <textarea
            value={specEmail.email}
            onChange={(e) => setSpecEmail((prev) => prev ? { ...prev, email: e.target.value } : prev)}
            rows={8}
            className="w-full  p-3 text-[13px] leading-relaxed resize-y outline-none"
            style={{ background: "var(--color-indigo-light)", border: "0.5px solid rgba(24,95,165,0.3)", color: "var(--color-ink)" }}
          />
          <div className="flex gap-2 mt-1.5 mb-2">
            <button
              className="ab flex items-center gap-1"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => { void navigator.clipboard.writeText(specEmail.email); toast.success("Copied."); }}
            >
              <IconCopy size={10} /> Copy
            </button>
            <button
              className="btn btn-accent btn-sm flex items-center gap-1"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => setSendDialog({ body: specEmail.email, to: c.email ?? "", subject: p.requisitions?.title ?? "Opportunity", candidateId: c.id })}
            >
              <IconSend size={10} /> Send
            </button>
          </div>
          <p className="sl mb-1.5">Talking points (if calling)</p>
          <div className="space-y-1">
            {specEmail.talking_points.map((pt, i) => (
              <div key={i} className="flex gap-2 text-[13px]">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-indigo)" }} />
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
            <p className="sl" style={{ color: "var(--color-indigo)" }}>Interview prep — CCM{ccmNumber}</p>
            <button onClick={() => setInterviewPrep(null)} className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>Dismiss</button>
          </div>
          <p className="sl mb-1">Candidate email</p>
          <textarea
            value={interviewPrep.candidate_email}
            onChange={(e) => setInterviewPrep((prev) => prev ? { ...prev, candidate_email: e.target.value } : prev)}
            rows={12}
            className="w-full  p-3 text-[13px] leading-relaxed resize-y outline-none mb-3"
            style={{ background: "var(--color-indigo-light)", border: "0.5px solid rgba(24,95,165,0.3)", color: "var(--color-ink)" }}
          />
          <p className="sl mb-1">Recruiter prep notes</p>
          <textarea
            value={interviewPrep.recruiter_prep_note}
            onChange={(e) => setInterviewPrep((prev) => prev ? { ...prev, recruiter_prep_note: e.target.value } : prev)}
            rows={5}
            className="w-full  p-3 text-[13px] leading-relaxed resize-y outline-none"
            style={{ background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)", color: "var(--color-ink)" }}
          />
        </div>
      )}

      {/* Submission package output */}
      {submissionPackage && (
        <SubmissionPackagePanel
          pkg={submissionPackage}
          candidateName={c.full_name}
          candidateId={c.id}
          clientId={p.requisitions?.clients?.id}
          onClose={() => setSubmissionPackage(null)}
        />
      )}

      {/* Send email dialog */}
      {sendDialog && (
        <SendEmailDialog
          open
          onClose={() => setSendDialog(null)}
          defaultTo={sendDialog.to}
          defaultSubject={sendDialog.subject}
          body={sendDialog.body}
          candidateId={sendDialog.candidateId}
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
  const qc = useQueryClient();
  const [showEmail, setShowEmail] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [loadingPositioning, setLoadingPositioning] = useState(false);
  const [positioning, setPositioning] = useState<string | null>(p.ai_snapshot);
  const [markingNotInterested, setMarkingNotInterested] = useState(false);

  async function handleNotInterested() {
    if (!confirm("Mark this candidate as not interested in this role? This will remove them from the buy-in priority list.")) return;
    setMarkingNotInterested(true);
    const { error } = await supabase
      .from("processes")
      .update({ not_interested_at: new Date().toISOString() })
      .eq("id", p.id);
    setMarkingNotInterested(false);
    if (error) { toast.error("Could not update. Try again."); return; }
    toast.success("Marked as not interested.");
    void qc.invalidateQueries({ queryKey: ["candidate-profile", c.id] });
  }

  const watchOuts = blockers.filter((b) => b.is_risk);

  async function generatePositioning() {
    setLoadingPositioning(true);
    try {
      const resp = await fetch("/api/ai?type=positioning", {
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

  const isNotInterested = !!p.not_interested_at;

  return (
    <div style={{ opacity: isNotInterested ? 0.5 : 1 }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
          Not yet approached. Goal is to get buy-in to submit the profile to the client.
        </p>
        {isNotInterested ? (
          <span
            className="text-[11px] font-mono px-2 py-1"
            style={{ background: "var(--color-ink-10)", color: "var(--color-ink-30)", border: "0.5px solid var(--color-ink-15)", whiteSpace: "nowrap" }}
          >
            Not interested — {new Date(p.not_interested_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        ) : (
          <button
            className="ab"
            style={{ fontSize: 11, padding: "4px 10px", color: "var(--color-ink-60)" }}
            onClick={() => void handleNotInterested()}
            disabled={markingNotInterested}
          >
            {markingNotInterested ? "Saving…" : "Not interested"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <SectionLabel>Why this could interest them</SectionLabel>
          {motivations.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No motivations recorded.</p>
          ) : (
            motivations.map((m) => (
              <div key={m.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span
                  className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: "var(--color-ink-30)" }}
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
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-gold)" }} />
                <span><strong>{b.theme}.</strong>{" "}<span style={{ color: "var(--color-ink-60)" }}>{b.detail}</span></span>
              </div>
            ))
          ) : (
            <>
              <div className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-gold)" }} />
                <span>Already in other processes — lead with optionality, not competition.</span>
              </div>
              <div className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-ink-30)" }} />
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
          className=" p-4 mb-3 text-[13px] font-mono whitespace-pre-wrap leading-relaxed"
          style={{
            background: "var(--color-ink-10)",
            border: "0.5px solid var(--color-ink-15)",
          }}
        >
          {emailPitch}
        </div>
      )}

      {showCall && (
        <div
          className=" p-4 mb-3 text-[13px] whitespace-pre-wrap leading-relaxed"
          style={{
            background: "var(--color-ink-10)",
            border: "0.5px solid var(--color-ink-15)",
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
                <AIToolbox actions={[{ key: "positioning", label: "Refresh talking points", icon: IconSparkles, loading: loadingPositioning, onRun: generatePositioning }]} />
              </div>
            );
          }
          return (
            <div
              className=" p-3 text-[13px]"
              style={{ background: "var(--color-ink-10)", border: "0.5px dashed rgba(26,26,24,0.22)" }}
            >
              <span style={{ color: "var(--color-ink-30)" }}>No positioning points yet. </span>
              <AIToolbox actions={[{ key: "positioning", label: "Generate talking points", icon: IconSparkles, loading: loadingPositioning, onRun: generatePositioning }]} inline />
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
      const resp = await fetch("/api/ai?type=closing-script", {
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
          className=" p-3 px-4 mb-4"
          style={{ background: "var(--color-ink-10)" }}
        >
          <div className="flex justify-between text-[13px] py-1.5" style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}>
            <span style={{ color: "var(--color-ink-60)" }}>Offer range</span>
            <span>
              {req.salary_min || req.salary_max
                ? `${formatYen(req.salary_min)} – ${formatYen(req.salary_max)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between text-[13px] py-1.5" style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}>
            <span style={{ color: "var(--color-ink-60)" }}>vs candidate floor</span>
            <span>
              {req.salary_min && c.base_minimum ? (
                req.salary_min >= c.base_minimum ? (
                  <span style={{ color: "var(--color-moss)", fontWeight: 500 }}>
                    ✓ Above {formatYen(c.base_minimum)} base minimum
                  </span>
                ) : (
                  <span style={{ color: "var(--color-danger)", fontWeight: 500 }}>
                    ✗ Below {formatYen(c.base_minimum)} base minimum
                  </span>
                )
              ) : (
                <span style={{ color: "var(--color-ink-30)" }}>Base minimum not recorded</span>
              )}
            </span>
          </div>
          {req.salary_stretch && (
            <div className="flex justify-between text-[13px] py-1.5">
              <span style={{ color: "var(--color-ink-60)" }}>Stretch available</span>
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
            <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-gold)" }} />
            <span><strong>Pre-close check.</strong> Have you confirmed what they need to say yes?</span>
          </div>
          <div className="flex gap-2 mb-1.5 text-[13px]">
            <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-gold)" }} />
            <span><strong>Sony counteroffer.</strong> Prepare them before they resign.</span>
          </div>
          <div className="flex gap-2 mb-1.5 text-[13px]">
            <span className="mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--color-gold)" }} />
            <span><strong>Family loop.</strong> Has everyone in the decision been informed?</span>
          </div>
        </div>

        {/* Counteroffer defense */}
        <div>
          <SectionLabel>Counteroffer defense</SectionLabel>
          <div
            className=" p-3 text-[13px] leading-relaxed mb-2"
            style={{ background: "var(--color-ink-10)", borderLeft: "2px solid rgba(24,95,165,0.3)" }}
          >
            Ask yourself — why did it take a resignation letter to get this? The reasons you decided to move are still there on Monday morning.
          </div>
          <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            Statistics: 60–80% who accept a counteroffer leave within 6 months. 90% within 12 months.
          </p>
        </div>
      </div>

      {/* Resignation prep */}
      <SectionLabel>Resignation prep talking points</SectionLabel>
      <div
        className=" p-3 text-[13px] leading-relaxed mb-3"
        style={{ background: "var(--color-ink-10)", borderLeft: "2px solid rgba(24,95,165,0.3)" }}
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
            <p className="sl" style={{ color: "var(--color-indigo)" }}>Closing script</p>
            <button
              onClick={() => setScriptContent(null)}
              className="text-[11px]"
              style={{ color: "var(--color-ink-30)" }}
            >
              Dismiss
            </button>
          </div>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            rows={18}
            className="w-full  p-3 text-[13px] leading-relaxed resize-y outline-none font-mono"
            style={{
              background: "var(--color-indigo-light)",
              border: "0.5px solid rgba(24,95,165,0.3)",
              color: "var(--color-ink)",
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
                  className="h-12"
                  style={{ background: "var(--color-ink-10)" }}
                />
              ))}
            </div>
          ) : reqs.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: "var(--color-ink-30)" }}>
              No open requisitions. Add one from a client account first.
            </p>
          ) : (
            <div className="space-y-4 py-1">
              {Object.values(grouped).map(({ clientName, reqs: clientReqs }) => (
                <div key={clientName}>
                  <p
                    className="text-[11px] font-medium uppercase mb-1.5"
                    style={{ color: "var(--color-ink-30)", letterSpacing: "0.04em" }}
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
                          className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors"
                          style={{
                            background: alreadyAdded ? "var(--color-ink-10)" : "var(--color-white)",
                            border: "0.5px solid var(--color-ink-15)",
                            opacity: alreadyAdded ? 0.6 : 1,
                            cursor: alreadyAdded ? "default" : "pointer",
                          }}
                          onMouseEnter={(e) => {
                            if (!alreadyAdded)
                              e.currentTarget.style.background = "var(--color-ink-10)";
                          }}
                          onMouseLeave={(e) => {
                            if (!alreadyAdded)
                              e.currentTarget.style.background = "var(--color-white)";
                          }}
                        >
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium truncate">{r.title}</p>
                            {(r.salary_min || r.salary_max) && (
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--color-ink-30)" }}>
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
                              className="text-[11px] font-medium px-2 py-0.5  shrink-0"
                              style={{ background: "var(--color-moss-light)", color: "var(--color-moss)" }}
                            >
                              Added
                            </span>
                          ) : isSaving ? (
                            <span className="text-[11px] shrink-0" style={{ color: "var(--color-ink-30)" }}>
                              Saving…
                            </span>
                          ) : (
                            <IconPlus size={14} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
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

// ─── Recall.ai invite dialog ──────────────────────────────────────────────────

function InviteRecallBotDialog({
  open,
  onClose,
  candidateId,
  recruiterId,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  recruiterId: string;
  onInvited: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInvite() {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai?type=invite-recall-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, meeting_url: url.trim(), recruiter_id: recruiterId }),
      });
      const json = (await res.json()) as { data?: { bot_id: string }; error?: string };
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success("Note-taker invited. It will join the call automatically.");
        setUrl("");
        onInvited();
        onClose();
      }
    } catch {
      toast.error("Could not invite note-taker. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite note-taker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-[13px]" style={{ color: "var(--color-ink-60)" }}>
            Paste your Zoom, Google Meet, or Teams link. A bot will join and transcribe the call, then post a summary here automatically.
          </p>
          <div>
            <label className="label block mb-1">Meeting URL</label>
            <Input
              placeholder="https://zoom.us/j/... or meet.google.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleInvite(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void handleInvite()}
            disabled={!url.trim() || loading}
          >
            {loading ? "Inviting..." : "Invite note-taker"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── active bot status banner ─────────────────────────────────────────────────

type BotSession = {
  id: string;
  bot_id: string;
  status: string;
  meeting_url: string;
  created_at: string;
};

function ActiveBotBanner({ candidateId }: { candidateId: string }) {
  const { data: sessions } = useQuery<BotSession[]>({
    queryKey: ["recall-bot-sessions", candidateId],
    queryFn: async () => {
      // @ts-expect-error — recall_bot_sessions not yet in generated types; run `supabase gen types` after migration 030 is applied
      const { data } = await supabase
        .from("recall_bot_sessions")
        .select("id, bot_id, status, meeting_url, created_at")
        .eq("candidate_id", candidateId)
        .in("status", ["invited", "in_progress"])
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as BotSession[];
    },
    staleTime: 30_000,
    retry: 1,
  });

  if (!sessions || sessions.length === 0) return null;

  const bot = sessions[0];
  const label =
    bot.status === "in_progress"
      ? "Note-taker is live on the call"
      : "Note-taker invited · joining shortly";

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-[12px]"
      style={{
        background: "var(--color-indigo-light)",
        color: "var(--color-indigo)",
        border: "0.5px solid var(--color-indigo)",
      }}
    >
      <IconRobot size={14} />
      <span>{label}</span>
      <span className="font-mono text-[11px] ml-auto" style={{ color: "var(--color-ink-30)" }}>
        {new Date(bot.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

// ─── candidate timeline tab ───────────────────────────────────────────────────

function CandidateTimelineTab({
  candidateId,
  recruiterId,
  interactions,
  phone,
  email,
  candidateName,
}: {
  candidateId: string;
  recruiterId: string;
  interactions: CandidateInteraction[];
  phone?: string | null;
  email?: string | null;
  candidateName?: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showInviteBot, setShowInviteBot] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showJobSpec, setShowJobSpec] = useState(false);

  const totalCount = interactions.length;
  const upcomingCount = interactions.filter((i) => i.is_future).length;

  return (
    <div className="space-y-3">
      {/* Active bot status */}
      <ActiveBotBanner candidateId={candidateId} />

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
          {totalCount} {totalCount === 1 ? "entry" : "entries"}
          {upcomingCount > 0 ? `, ${upcomingCount} upcoming` : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="ab flex items-center gap-1"
            onClick={() => setShowCall(true)}
          >
            <IconPhone size={12} />
            Call
          </button>
          <button
            className="ab flex items-center gap-1"
            onClick={() => setShowJobSpec(true)}
          >
            Job spec
          </button>
          <button
            className="ab flex items-center gap-1"
            onClick={() => setShowLogActivity(true)}
          >
            <IconPlus size={12} />
            {t('candidateDetail.actions.logActivity')}
          </button>
          <button
            className="ab flex items-center gap-1"
            onClick={() => setShowInviteBot(true)}
          >
            <IconVideo size={12} />
            Invite note-taker
          </button>
          <button
            className="ab flex items-center gap-1"
            onClick={() => { setShowTranscript((v) => !v); }}
          >
            <IconMessage size={12} />
            {showTranscript ? "Hide transcript" : t('candidateDetail.actions.pasteTranscript')}
          </button>
        </div>
      </div>

      <LogActivityModal
        open={showLogActivity}
        onClose={() => setShowLogActivity(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
        }}
        context={{ type: "candidate", id: candidateId }}
      />

      <LiveCallPanel
        open={showCall}
        onClose={() => setShowCall(false)}
        phone={phone}
        personName={candidateName ?? undefined}
        candidateId={candidateId}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
        }}
      />

      <SendEmailDialog
        open={showJobSpec}
        onClose={() => setShowJobSpec(false)}
        defaultTo={email ?? ""}
        defaultSubject="Job Opportunity"
        body=""
        bodyEditable
        candidateId={candidateId}
        interactionType="job spec sent"
        onSent={() => {
          void queryClient.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
        }}
      />

      <InviteRecallBotDialog
        open={showInviteBot}
        onClose={() => setShowInviteBot(false)}
        candidateId={candidateId}
        recruiterId={recruiterId}
        onInvited={() => {
          void queryClient.invalidateQueries({ queryKey: ["recall-bot-sessions", candidateId] });
        }}
      />

      {showTranscript && (
        <TranscriptPanel
          candidateId={candidateId}
          recruiterId={recruiterId}
          onClose={() => setShowTranscript(false)}
        />
      )}

      <ActivityTimeline
        interactions={interactions}
        perspective="candidate"
        currentUserId={recruiterId}
        onDeleted={() => {
          void queryClient.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
        }}
        emptyMessage="No activity recorded yet."
        emptySubMessage="Interactions linked to this candidate and their active processes will appear here."
      />
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
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  linkedinUrl: string | null;
  japanese_level: string | null;
  english_level: string | null;
  additionalLanguages: string | null;
  notice_period_months: number | null;
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
  teamId,
  cvUrl,
  onExtracted,
}: {
  candidateId: string;
  teamId: string;
  cvUrl: string | null;
  onExtracted: (data: ExtractedCandidate) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const recruiterId = user?.id ?? "";
  const [state, setState] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file || file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    setState("uploading");
    try {
      const path = `${teamId}/${candidateId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
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
      // Auto-extract immediately — no second click needed
      void runExtraction(path);
    } catch (err) {
      console.error(err);
      toast.error("Upload failed. Check the browser console for details.");
      setState("error");
    }
  }

  function fallbackStoragePath(path: string): string | null {
    if (!recruiterId) return null;
    const segments = path.split("/");
    if (segments[0] === recruiterId) return null; // already recruiter_id prefix
    segments[0] = recruiterId;
    return segments.join("/");
  }

  async function runExtraction(path: string) {
    setState("extracting");
    try {
      const resp = await fetch("/api/ai?type=extract-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, storageKey: path }),
      });
      if (!resp.ok) {
        // Retry with recruiter_id-prefixed path (backward compat for pre-team_id uploads)
        const fallback = fallbackStoragePath(path);
        if (fallback) {
          console.warn("[CvUploadZone] runExtraction: primary path failed, retrying with recruiter_id prefix");
          const resp2 = await fetch("/api/ai?type=extract-candidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId, storageKey: fallback }),
          });
          if (resp2.ok) {
            const data2 = (await resp2.json()) as ExtractedCandidate & { error?: string };
            if (!data2.error) { setState("done"); onExtracted(data2); return; }
          }
        }
        const errText = await resp.text();
        if (resp.status === 404) {
          toast.error("API route not found. Run the app with `vercel dev` instead of `npm run dev` to use AI features locally.");
        } else {
          toast.error(`Extraction failed (${resp.status}): ${errText.slice(0, 120)}`);
        }
        setState("error");
        return;
      }
      const data = (await resp.json()) as ExtractedCandidate & { error?: string };
      if (data.error) {
        toast.error("Could not extract CV data. Try again.");
        setState("error");
        return;
      }
      setState("done");
      onExtracted(data);
    } catch (err) {
      console.error(err);
      toast.error("Extraction failed. Check the browser console for details.");
      setState("error");
    }
  }

  const [fetchingUrl, setFetchingUrl] = useState(false);

  async function handleView(e: React.MouseEvent) {
    e.stopPropagation();
    if (!cvUrl) return;
    setFetchingUrl(true);
    try {
      const { data, error } = await supabase.storage.from("resumes").createSignedUrl(cvUrl, 120);
      if (error || !data?.signedUrl) {
        // Retry with recruiter_id-prefixed path (backward compat for pre-team_id uploads)
        const fallback = fallbackStoragePath(cvUrl);
        if (fallback) {
          console.warn("[CvUploadZone] handleView: primary path failed, retrying with recruiter_id prefix");
          const { data: fd, error: fe } = await supabase.storage.from("resumes").createSignedUrl(fallback, 120);
          if (!fe && fd?.signedUrl) { window.open(fd.signedUrl, "_blank", "noopener,noreferrer"); return; }
        }
        toast.error("Could not open CV. Try again.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open CV. Try again.");
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this CV? The file will be deleted and the field cleared.")) return;
    if (cvUrl) {
      await supabase.storage.from("resumes").remove([cvUrl]);
    }
    await supabase.from("candidates").update({ cv_url: null }).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
    setState("idle");
    toast.success("CV removed.");
  }

  return (
    <>
      <div
        className=" px-4 py-3 flex items-center gap-3 transition-colors"
        style={{
          background: dragging ? "var(--color-indigo-light)" : "var(--color-ink-10)",
          border: `0.5px dashed ${dragging ? "var(--color-indigo)" : "rgba(26,26,24,0.2)"}`,
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
        <IconFileText size={16} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          {state === "idle" && (
            <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
              {cvUrl
                ? "CV on file — drop a new PDF to re-upload"
                : "Drop a PDF CV here or click to upload"}
            </p>
          )}
          {state === "uploading" && (
            <p className="text-[12px]" style={{ color: "var(--color-indigo)" }}>Uploading…</p>
          )}
          {state === "extracting" && (
            <p className="text-[12px]" style={{ color: "var(--color-indigo)" }}>Uploading and extracting with AI…</p>
          )}
          {state === "done" && (
            <p className="text-[12px]" style={{ color: "var(--color-moss)" }}>Extraction complete</p>
          )}
          {state === "error" && (
            <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>Failed — click to retry</p>
          )}
        </div>
        {cvUrl && state === "idle" && (
          <>
            <button
              onClick={handleView}
              disabled={fetchingUrl}
              className="text-[11px] px-2 py-0.5 shrink-0"
              style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)", border: "0.5px solid rgba(24,95,165,0.3)" }}
            >
              {fetchingUrl ? "Opening…" : "View"}
            </button>
            <button
              onClick={handleRemove}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] shrink-0"
              style={{ background: "var(--color-white)", color: "var(--color-ink-60)", border: "0.5px solid var(--color-ink-15)" }}
              title="Remove CV"
            >
              <IconX size={10} /> Remove
            </button>
          </>
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

    </>
  );
}

// ─── extraction review modal ──────────────────────────────────────────────────

type ExtractionSource = "cv" | "reg";

type FieldSpec = {
  label: string;
  get: (e: ExtractedCandidate) => string | number | null | undefined;
  format?: (v: string | number) => string;
};

const FIELD_SPECS: Array<FieldSpec & { dbKey: string }> = [
  { label: "Full name (English)", dbKey: "full_name",            get: (e) => e.full_name },
  { label: "Full name (Japanese)", dbKey: "full_name_japanese",  get: (e) => e.full_name_japanese },
  { label: "Current title",        dbKey: "current_title",       get: (e) => e.current_title },
  { label: "Current company",      dbKey: "current_company",     get: (e) => e.current_company },
  { label: "Age",                  dbKey: "age",                 get: (e) => e.age },
  { label: "Date of birth",        dbKey: "date_of_birth",       get: (e) => e.date_of_birth },
  { label: "Email",                dbKey: "email",               get: (e) => e.email },
  { label: "Phone",                dbKey: "phone",               get: (e) => e.phone },
  { label: "Address",              dbKey: "address",             get: (e) => e.address },
  { label: "LinkedIn",             dbKey: "linkedin_url",        get: (e) => e.linkedinUrl },
  { label: "Japanese level",       dbKey: "japanese_level",      get: (e) => e.japanese_level },
  { label: "English level",        dbKey: "english_level",       get: (e) => e.english_level },
  { label: "Additional languages", dbKey: "additional_languages",get: (e) => e.additionalLanguages },
  { label: "Notice period",        dbKey: "notice_period_months",get: (e) => e.notice_period_months, format: (v) => `${v} months` },
  { label: "Current base",         dbKey: "current_base",        get: (e) => e.current_base,  format: (v) => `¥${(Number(v) / 1_000_000).toFixed(1)}M` },
  { label: "Current total",        dbKey: "current_total",       get: (e) => e.current_total, format: (v) => `¥${(Number(v) / 1_000_000).toFixed(1)}M` },
];

function ExtractionReviewModal({
  open,
  onClose,
  cvExtracted,
  regExtracted,
  candidateId,
  currentCandidate,
}: {
  open: boolean;
  onClose: () => void;
  cvExtracted: ExtractedCandidate | null;
  regExtracted: ExtractedCandidate | null;
  candidateId: string;
  currentCandidate: Candidate;
}) {
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);
  // Per-field conflict resolution: "cv" or "reg"
  const [resolution, setResolution] = useState<Record<string, ExtractionSource>>({});

  useEffect(() => {
    if (open) setResolution({});
  }, [open]);

  const hasConflicts = FIELD_SPECS.some((f) => {
    const cv = cvExtracted ? f.get(cvExtracted) : null;
    const reg = regExtracted ? f.get(regExtracted) : null;
    return cv != null && reg != null && String(cv) !== String(reg);
  });

  function resolvedValue(f: typeof FIELD_SPECS[number]): string | number | null | undefined {
    const cv = cvExtracted ? f.get(cvExtracted) : null;
    const reg = regExtracted ? f.get(regExtracted) : null;
    if (cv != null && reg != null && String(cv) !== String(reg)) {
      // Conflict: use recruiter's choice, default to "reg" (signed document is authoritative)
      const chosen = resolution[f.dbKey] ?? "reg";
      return chosen === "cv" ? cv : reg;
    }
    return cv ?? reg ?? null;
  }

  // A field should be cleared only when the registration form (source of truth) explicitly
  // found no value for it AND the CV also has no value. CV-only null never clears existing data.
  function shouldClear(f: typeof FIELD_SPECS[number]): boolean {
    const v = resolvedValue(f);
    if (v != null) return false;
    const dbVal = (currentCandidate as unknown as Record<string, unknown>)[f.dbKey];
    if (dbVal == null) return false;
    // Only clear if the registration form was present and returned null for this field
    const regVal = regExtracted ? f.get(regExtracted) : undefined;
    return regExtracted != null && regVal == null;
  }

  async function applyFields() {
    setApplying(true);
    try {
      const patch: TablesUpdate<"candidates"> = {};
      for (const f of FIELD_SPECS) {
        const v = resolvedValue(f);
        if (v != null) {
          (patch as Record<string, string | number>)[f.dbKey] = v as string | number;
        } else if (shouldClear(f)) {
          (patch as Record<string, null>)[f.dbKey] = null;
        }
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("candidates").update(patch).eq("id", candidateId);
        if (error) throw error;
      }
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success("Fields applied.");
      onClose();
    } catch {
      toast.error("Failed to apply fields.");
    } finally {
      setApplying(false);
    }
  }

  const bothSources = cvExtracted != null && regExtracted != null;
  const roles = (() => {
    const cv = cvExtracted?.roles ?? [];
    const reg = regExtracted?.roles ?? [];
    if (!cv.length) return reg;
    if (!reg.length) return cv;
    // Both present — merge, dedup by company_name+title, preferring cv entries
    const seen = new Set<string>();
    const merged = [...cv];
    for (const r of merged) seen.add(`${r.company_name}|${r.title}`);
    for (const r of reg) {
      if (!seen.has(`${r.company_name}|${r.title}`)) merged.push(r);
    }
    return merged;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 540 }}>
        <DialogHeader>
          <DialogTitle>Extraction review</DialogTitle>
        </DialogHeader>

        <p className="text-[12px] mb-3" style={{ color: "var(--color-ink-60)" }}>
          {hasConflicts
            ? "Some fields differ between the CV and registration form. Choose which value to use for each conflict."
            : "Review the extracted data below and click Apply to populate the candidate record."}
        </p>

        <div className="mb-4 space-y-0">
          {FIELD_SPECS.map((f) => {
            const cv = cvExtracted ? f.get(cvExtracted) : null;
            const reg = regExtracted ? f.get(regExtracted) : null;
            const isConflict = cv != null && reg != null && String(cv) !== String(reg);
            const displayVal = resolvedValue(f);
            const willClear = !isConflict && displayVal == null && shouldClear(f);
            if (displayVal == null && !isConflict && !willClear) return null;

            const fmt = (v: string | number | null | undefined) =>
              v == null ? null : f.format ? f.format(v as string | number) : String(v);

            if (willClear) {
              return (
                <div key={f.dbKey} className="flex items-baseline justify-between gap-4 py-1.5" style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}>
                  <span className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>{f.label}</span>
                  <span className="text-[12px] font-mono" style={{ color: "var(--color-vermillion)" }}>will be cleared</span>
                </div>
              );
            }

            if (isConflict) {
              const chosen = resolution[f.dbKey] ?? "reg";
              return (
                <div key={f.dbKey} className="py-2" style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>{f.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5" style={{ background: "var(--color-gold-light)", color: "var(--color-gold)" }}>CONFLICT</span>
                  </div>
                  <div className="flex gap-2">
                    {(["cv", "reg"] as ExtractionSource[]).map((src) => {
                      const val = src === "cv" ? cv : reg;
                      const active = chosen === src;
                      return (
                        <button
                          key={src}
                          onClick={() => setResolution((r) => ({ ...r, [f.dbKey]: src }))}
                          className="flex-1 text-left px-3 py-2 text-[12px] transition-colors"
                          style={{
                            background: active ? "var(--color-ink)" : "var(--color-ink-10)",
                            color: active ? "var(--color-white)" : "var(--color-ink)",
                            border: `0.5px solid ${active ? "var(--color-ink)" : "var(--color-ink-15)"}`,
                          }}
                        >
                          <span className="block text-[10px] font-mono uppercase tracking-wide mb-0.5" style={{ color: active ? "rgba(253,252,250,0.5)" : "var(--color-ink-30)" }}>
                            {src === "cv" ? "CV" : "Registration form"}
                          </span>
                          {fmt(val)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={f.dbKey} className="flex items-baseline justify-between gap-4 py-1.5" style={{ borderBottom: "0.5px solid rgba(26,26,24,0.08)" }}>
                <span className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>{f.label}</span>
                <div className="flex items-center gap-2">
                  {bothSources && (
                    <span className="text-[10px] font-mono" style={{ color: "var(--color-ink-30)" }}>
                      {cv != null ? "CV" : "Reg"}
                    </span>
                  )}
                  <span className="text-[13px] font-medium">{fmt(displayVal)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {roles.length > 0 && (
          <div className="mb-4">
            <p className="sl mb-2">Work history (add manually to timeline)</p>
            <div className="space-y-1.5">
              {roles.map((r, i) => (
                <div key={i} className="px-3 py-2"
                  style={{ background: "var(--color-ink-10)", border: "0.5px solid var(--color-ink-15)" }}>
                  <p className="text-[12px] font-medium">{r.company_name} — {r.title}</p>
                  <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                    {r.start_date ?? "?"} – {r.is_current ? "Present" : (r.end_date ?? "?")}
                  </p>
                  {r.reasonForLeaving && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--color-ink-30)" }}>Left: {r.reasonForLeaving}</p>
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
  active:  { bg: "var(--color-moss-light)", color: "var(--color-moss)", border: "#b0d88a" },
  passive: { bg: "var(--color-gold-light)", color: "var(--color-gold)", border: "#fac775" },
  placed:  { bg: "var(--color-indigo-light)", color: "var(--color-indigo)", border: "#9ec5ef" },
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
          className="flex items-center gap-1  px-2 py-0.5 text-[11px] font-medium"
          style={{ background: s.bg, color: s.color, border: `0.5px solid ${s.border}` }}
        >
          <span className="capitalize">{current}</span>
          <IconChevronDown size={10} />
        </button>

        {open && (
          <div
            className="absolute left-0 z-20 mt-0.5 w-32 overflow-hidden  "
            style={{ background: "var(--color-white)", border: "0.5px solid rgba(26,26,24,0.16)", top: "100%" }}
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
        <IconPencil size={10} style={{ color: "var(--color-ink-30)" }} title="Manually set" />
      )}

      {showCoin && (
        <span className="flex items-center gap-0.5">
          <span title="Placed within 90 days">🪙</span>
          <button
            type="button"
            className="text-[10px] leading-none"
            style={{ color: "var(--color-ink-30)" }}
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
  teamId,
  registrationFormUrl,
  onExtracted,
}: {
  candidateId: string;
  teamId: string;
  registrationFormUrl: string | null;
  onExtracted: (data: ExtractedCandidate) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const recruiterId = user?.id ?? "";
  const [state, setState] = useState<"idle" | "uploading" | "extracting" | "done" | "error">("idle");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function fallbackStoragePath(path: string): string | null {
    if (!recruiterId) return null;
    const segments = path.split("/");
    if (segments[0] === recruiterId) return null;
    segments[0] = recruiterId;
    return segments.join("/");
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") { toast.error("PDF files only."); return; }
    setState("uploading");
    try {
      const path = `${teamId}/${candidateId}/regform_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(path, file);
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); setState("error"); return; }
      await supabase.from("candidates").update({ registration_form_url: path }).eq("id", candidateId);
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      // Auto-extract immediately
      void runExtraction(path);
    } catch { toast.error("Upload failed."); setState("error"); }
  }

  async function runExtraction(path: string) {
    setState("extracting");
    try {
      const resp = await fetch("/api/ai?type=extract-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, storageKey: path }),
      });
      if (!resp.ok) {
        // Retry with recruiter_id-prefixed path (backward compat for pre-team_id uploads)
        const fallback = fallbackStoragePath(path);
        if (fallback) {
          console.warn("[RegistrationFormUploadZone] runExtraction: primary path failed, retrying with recruiter_id prefix");
          const resp2 = await fetch("/api/ai?type=extract-candidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidateId, storageKey: fallback }),
          });
          if (resp2.ok) {
            const data2 = (await resp2.json()) as ExtractedCandidate & { error?: string };
            if (!data2.error) { setState("done"); onExtracted(data2); return; }
          }
        }
        toast.error(`Extraction failed (${resp.status})`);
        setState("error");
        return;
      }
      const data = (await resp.json()) as ExtractedCandidate & { error?: string };
      if (data.error) {
        toast.error("Could not extract registration form data. Try again.");
        setState("error");
        return;
      }
      setState("done");
      onExtracted(data);
    } catch {
      toast.error("Extraction failed. Try again.");
      setState("error");
    }
  }

  async function handleRemoveReg(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this registration form? The file will be deleted.")) return;
    if (registrationFormUrl) {
      await supabase.storage.from("resumes").remove([registrationFormUrl]);
    }
    await supabase.from("candidates").update({ registration_form_url: null }).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
    setState("idle");
    toast.success("Registration form removed.");
  }

  async function handleView(e: React.MouseEvent) {
    e.stopPropagation();
    if (!registrationFormUrl) return;
    setFetchingUrl(true);
    try {
      const { data, error } = await supabase.storage.from("resumes").createSignedUrl(registrationFormUrl, 120);
      if (error || !data?.signedUrl) {
        // Retry with recruiter_id-prefixed path (backward compat for pre-team_id uploads)
        const fallback = fallbackStoragePath(registrationFormUrl);
        if (fallback) {
          console.warn("[RegistrationFormUploadZone] handleView: primary path failed, retrying with recruiter_id prefix");
          const { data: fd, error: fe } = await supabase.storage.from("resumes").createSignedUrl(fallback, 120);
          if (!fe && fd?.signedUrl) { window.open(fd.signedUrl, "_blank", "noopener,noreferrer"); return; }
        }
        toast.error("Could not open registration form. Try again.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open registration form. Try again.");
    } finally {
      setFetchingUrl(false);
    }
  }

  return (
    <div
      className=" px-4 py-3 flex items-center gap-3 transition-colors"
      style={{
        background: "var(--color-ink-10)",
        border: "0.5px dashed rgba(26,26,24,0.2)",
        cursor: state === "idle" || state === "error" ? "pointer" : "default",
      }}
      onClick={() => (state === "idle" || state === "error") && inputRef.current?.click()}
    >
      <IconFileText size={16} style={{ color: "var(--color-ink-30)", flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        {state === "idle" && (
          <p className="text-[12px]" style={{ color: "var(--color-ink-60)" }}>
            {registrationFormUrl
              ? "Registration form on file — click to replace"
              : "Registration Form (signed) — drop PDF or click to upload"}
          </p>
        )}
        {state === "uploading" && (
          <p className="text-[12px]" style={{ color: "var(--color-indigo)" }}>Uploading…</p>
        )}
        {state === "extracting" && (
          <p className="text-[12px]" style={{ color: "var(--color-indigo)" }}>Uploading and extracting with AI…</p>
        )}
        {state === "done" && (
          <p className="text-[12px]" style={{ color: "var(--color-moss)" }}>Extraction complete</p>
        )}
        {state === "error" && (
          <p className="text-[12px]" style={{ color: "var(--color-danger)" }}>Failed — click to retry</p>
        )}
      </div>
      {registrationFormUrl && state === "idle" && (
        <>
          <button
            onClick={handleView}
            disabled={fetchingUrl}
            className="text-[11px] px-2 py-0.5 shrink-0"
            style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)", border: "0.5px solid rgba(24,95,165,0.3)" }}
          >
            {fetchingUrl ? "Opening…" : "View"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); void runExtraction(registrationFormUrl); }}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] shrink-0"
            style={{ background: "var(--color-white)", color: "var(--color-ink-60)", border: "0.5px solid var(--color-ink-15)" }}
          >
            <IconSparkles size={10} /> Re-extract
          </button>
          <button
            onClick={handleRemoveReg}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] shrink-0"
            style={{ background: "var(--color-white)", color: "var(--color-ink-60)", border: "0.5px solid var(--color-ink-15)" }}
            title="Remove registration form"
          >
            <IconX size={10} /> Remove
          </button>
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
      await fetch("/api/ai?type=refresh-context", {
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
    <div className=" overflow-hidden" style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}>
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <IconSparkles size={13} style={{ color: "var(--color-ink-30)" }} />
        <span className="flex-1 text-[12px] font-medium" style={{ color: "var(--color-ink-60)" }}>
          Candidate intelligence
        </span>
        {aiContextUpdatedAt && (
          <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            Updated {relativeTime(aiContextUpdatedAt)}
          </span>
        )}
        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          {aiContext ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap mb-3" style={{ color: "var(--color-ink)" }}>
              {aiContext}
            </p>
          ) : (
            <p className="text-[13px] mb-3" style={{ color: "var(--color-ink-30)" }}>
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
  const { t } = useTranslation();
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
        <span className="text-[12px] font-medium" style={{ color: "var(--color-ink-60)" }}>Candidate profile data</span>
        <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>{profileOpen ? "▴" : "▾"}</span>
        <span className="text-[11px] ml-auto" style={{ color: "var(--color-ink-30)" }}>feeds AI context</span>
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
              <FieldRow label="Source">
                {c.source
                  ? ({ linkedin: "LinkedIn", bizreach: "BizReach", doda: "Doda", referral: "Referral", inbound: "Inbound", other: "Other" }[c.source] ?? c.source)
                  : "—"}
              </FieldRow>
              <FieldRow label="Urgency to move">
                {c.active_passive ? (
                  <span style={{
                    color: c.active_passive === "Active" ? "var(--color-moss)" : "var(--color-ink-30)",
                    fontWeight: c.active_passive === "Active" ? 500 : 400,
                  }}>
                    {c.active_passive}
                  </span>
                ) : "—"}
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
              <SectionLabel className="mb-0">{t('candidateDetail.sections.jobHistory')}</SectionLabel>
              <button className="ab" onClick={() => setOpenDialog("role")}>
                <IconPlus size={11} /> {t('candidateDetail.actions.addRole')}
              </button>
            </div>
            {roles.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>No roles added yet.</p>
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
              <SectionLabel className="mb-0">{t('candidateDetail.sections.motivations')}</SectionLabel>
              <button
                className="ab"
                onClick={() => setOpenDialog("motivation")}
                disabled={motivations.length >= 3}
                title={motivations.length >= 3 ? "All 3 ranks are filled" : undefined}
              >
                <IconPlus size={11} /> {t('candidateDetail.actions.addMotivation')}
              </button>
            </div>
            {motivations.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>{t('candidateDetail.motivations.noMotivations')}</p>
            ) : (
              motivations.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2  border px-3 py-2 text-[13px] mb-1.5"
                  style={{ background: "var(--color-ink-10)", borderColor: "rgba(26,26,24,0.12)" }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
                    style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)" }}
                  >
                    {m.rank}
                  </span>
                  <span className="flex-1">{m.motivation_text}</span>
                  {m.motivation_type && (
                    <span className="text-[11px] px-2 py-0.5 " style={{ background: "var(--color-indigo-light)", color: "var(--color-indigo)" }}>
                      {m.motivation_type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              ))
            )}
            {motivations.length > 0 && (
              <p className="mt-2 text-[11px] flex items-center gap-1" style={{ color: "var(--color-ink-30)" }}>
                <IconInfoCircle size={12} />
                AI uses this ranking to sequence positioning talking points
              </p>
            )}
          </Card>

          {/* Blockers */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel className="mb-0">{t('candidateDetail.sections.blockers')}</SectionLabel>
              <button className="ab" onClick={() => setOpenDialog("blocker")}>
                <IconPlus size={11} /> {t('candidateDetail.actions.addBlocker')}
              </button>
            </div>
            {blockers.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>
                None recorded. Add family constraints, geographic limits, or other context.
              </p>
            ) : (
              [...blockers].sort((a, b) => (b.is_risk ? 1 : 0) - (a.is_risk ? 1 : 0)).map((b) => (
                <div key={b.id} className="flex gap-2 mb-1.5 text-[13px] leading-relaxed">
                  <span
                    className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ background: b.is_risk ? "var(--color-gold)" : "var(--color-ink-30)" }}
                  />
                  <span>
                    <strong>{b.theme}.</strong>{" "}
                    <span style={{ color: b.is_risk ? "var(--color-ink)" : "var(--color-ink-60)" }}>{b.detail}</span>
                  </span>
                </div>
              ))
            )}
          </Card>

          {/* Competing interviews */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel className="mb-0">{t('candidateDetail.sections.competingInterviews')}</SectionLabel>
              <button className="ab" onClick={() => setOpenDialog("competing")}>
                <IconPlus size={11} /> Add
              </button>
            </div>
            {competing.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--color-ink-30)" }}>None recorded at registration.</p>
            ) : (
              competing.map((ci) => (
                <div
                  key={ci.id}
                  className="flex items-center justify-between py-1.5 text-[13px]"
                  style={{ borderBottom: "0.5px solid var(--color-ink-15)", opacity: ci.is_active ? 1 : 0.45 }}
                >
                  <span className="font-medium" style={{ textDecoration: ci.is_active ? "none" : "line-through" }}>
                    {ci.company_name}
                  </span>
                  <div className="flex items-center gap-2">
                    {ci.source && <span style={{ color: "var(--color-ink-60)", fontSize: 12 }}>{ci.source}</span>}
                    {ci.stage && (
                      <span className="text-[11px] px-2 py-0.5 " style={{ background: "var(--color-ink-10)", color: "var(--color-ink-60)" }}>
                        {ci.stage}
                      </span>
                    )}
                    <button
                      className="text-[11px] px-2 py-0.5 "
                      style={{ background: ci.is_active ? "var(--color-moss-light)" : "var(--color-ink-10)", color: ci.is_active ? "var(--color-moss)" : "var(--color-ink-30)", border: "0.5px solid var(--color-ink-15)" }}
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
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel className="mb-0">{t('candidateDetail.sections.compensation')}</SectionLabel>
        <div className="flex items-center gap-2">
          {onSyncFromNotes && c.notes_template && (
            <button
              className="ab flex items-center gap-1"
              onClick={onSyncFromNotes}
              disabled={syncing}
              title="Extract salary from candidate notes"
            >
              <IconSparkles size={11} />
              {syncing ? "Syncing…" : t('candidateDetail.actions.syncFromNotes')}
            </button>
          )}
          <button className="ab flex items-center gap-1" onClick={onEdit}>
            <IconPencil size={11} /> {t('candidateDetail.actions.editComp')}
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
  const { t } = useTranslation();
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "var(--color-ink-30)" }}>¥</span>
          <Input
            type="number"
            value={form[k]}
            onChange={(e) => setF(k, e.target.value)}
            className="pl-6 text-[13px]"
            placeholder="e.g. 12"
          />
        </div>
        <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>Enter in ¥M — type 12 for ¥12M</p>
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

// ─── Japanese document upload zone (storage only, no AI extraction) ───────────

function JpDocumentUploadZone({
  candidateId,
  teamId,
  fieldKey,
  label,
  sublabel,
  fileUrl,
}: {
  candidateId: string;
  teamId: string;
  fieldKey: "cv_url_jp_shokumu" | "cv_url_jp_rireki";
  label: string;
  sublabel: string;
  fileUrl: string | null | undefined;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") { toast.error("PDF files only."); return; }
    setUploading(true);
    try {
      const path = `${teamId}/${candidateId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadErr } = await supabase.storage.from("resumes").upload(path, file);
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); return; }
      await supabase.from("candidates").update({ [fieldKey]: path }).eq("id", candidateId);
      void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
      toast.success(`${label} uploaded.`);
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleView() {
    if (!fileUrl) return;
    setFetchingUrl(true);
    try {
      const { data } = await supabase.storage.from("resumes").createSignedUrl(fileUrl, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      else toast.error("Could not generate preview link.");
    } catch {
      toast.error("Could not generate preview link.");
    } finally {
      setFetchingUrl(false);
    }
  }

  async function handleRemove() {
    await supabase.from("candidates").update({ [fieldKey]: null }).eq("id", candidateId);
    void qc.invalidateQueries({ queryKey: ["candidate-profile", candidateId] });
    toast.success(`${label} removed.`);
  }

  const fileName = fileUrl ? fileUrl.split("/").pop() : null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{label}</p>
          <p className="text-[11px]" style={{ color: "var(--color-ink-60)" }}>{sublabel}</p>
          {fileUrl && fileName && (
            <p className="mt-1 text-[11px] font-mono truncate" style={{ color: "var(--color-moss)" }}>
              {decodeURIComponent(fileName.replace(/^\d+_/, ""))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {fileUrl ? (
            <>
              <button
                className="ab"
                onClick={handleView}
                disabled={fetchingUrl}
              >
                {fetchingUrl ? "Opening…" : t('common.view')}
              </button>
              <button
                className="ab"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : t('candidateDetail.documents.replaceDocument')}
              </button>
              <button
                className="text-[11px] px-2 py-1"
                style={{ color: "#a32d2d", border: "0.5px solid rgba(163,45,45,0.3)" }}
                onClick={handleRemove}
              >
                {t('common.remove')}
              </button>
            </>
          ) : (
            <button
              className="ab"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : t('common.upload')}
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
      />
    </Card>
  );
}

