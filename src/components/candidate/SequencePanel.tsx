import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconMail,
  IconBrandLinkedin,
  IconPlayerPlay,
  IconX,
  IconCheck,
  IconSparkles,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { nextSendAt, isBonusSeason } from "@/lib/candidate-utils";

// ─── types ────────────────────────────────────────────────────────────────────

type SequenceStep = {
  channel: "email" | "linkedin";
  delay_days: number;
  intent: string;
};

type PresetTemplate = {
  key: string;
  name: string;
  description: string;
  steps: SequenceStep[];
};

type Enrollment = {
  id: string;
  current_step: number;
  next_send_at: string | null;
  status: string;
  outreach_sequences: {
    name: string;
    steps: SequenceStep[];
  } | null;
};

// ─── preset templates ─────────────────────────────────────────────────────────

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    key: "initial_outreach",
    name: "Initial outreach",
    description: "3-step introduction cadence for a candidate you haven't contacted yet.",
    steps: [
      { channel: "email",    delay_days: 0, intent: "First touch — introduce yourself and a specific role that matches their background" },
      { channel: "linkedin", delay_days: 4, intent: "Follow-up — candidate has not responded; reference the email briefly and keep it short" },
      { channel: "email",    delay_days: 7, intent: "Final nudge — last attempt before moving on; keep it brief and leave the door open" },
    ],
  },
  {
    key: "re_engagement",
    name: "Re-engagement",
    description: "2-step sequence for a passive candidate you spoke with before but lost touch with.",
    steps: [
      { channel: "email",    delay_days: 0, intent: "Re-engage — reconnect with a candidate you know; reference your last conversation and ask if their situation has changed" },
      { channel: "linkedin", delay_days: 5, intent: "Warm check-in — candidate has not replied; brief follow-up, no pressure" },
    ],
  },
  {
    key: "offer_follow_up",
    name: "Offer follow-up",
    description: "2-step sequence for a candidate who received an offer and has gone quiet.",
    steps: [
      { channel: "email",    delay_days: 0, intent: "Offer check-in — candidate received an offer; check in on their thinking, address hesitation, and reinforce the opportunity" },
      { channel: "email",    delay_days: 2, intent: "Decision support — help candidate think through concerns; acknowledge the weight of the decision without pushing urgency" },
    ],
  },
];

// ─── active enrollment widget ─────────────────────────────────────────────────

export function SequenceStatusWidget({ candidateId }: { candidateId: string }) {
  const queryClient = useQueryClient();

  const { data: enrollment } = useQuery<Enrollment | null>({
    queryKey: ["sequence-enrollment", candidateId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data } = await supabase
        .from("outreach_enrollments")
        .select("id, current_step, next_send_at, status, outreach_sequences(name, steps)")
        .eq("candidate_id", candidateId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Enrollment | null) ?? null;
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("outreach_enrollments")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sequence-enrollment", candidateId] });
      void queryClient.invalidateQueries({ queryKey: ["priority-actions"] });
      toast.success("Sequence cancelled.");
    },
    onError: () => toast.error("Could not cancel sequence. Try again."),
  });

  if (!enrollment) return null;

  const seq = enrollment.outreach_sequences;
  if (!seq) return null;
  const steps = seq.steps as SequenceStep[];
  const totalSteps = steps.length;
  const currentStep = enrollment.current_step + 1; // 1-indexed display

  const nextDate = enrollment.next_send_at
    ? new Date(enrollment.next_send_at).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div
      className="flex items-center gap-2 mt-1.5"
      style={{ borderLeft: "2px solid var(--color-indigo)", paddingLeft: "8px" }}
    >
      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--color-indigo)" }}>
        {seq.name}
      </span>
      <span className="font-mono text-[10px]" style={{ color: "var(--color-ink-60)" }}>
        Step {currentStep} of {totalSteps}
        {nextDate ? ` · sends ${nextDate}` : ""}
      </span>
      <button
        onClick={() => { if (window.confirm("Cancel this sequence?")) cancelMut.mutate(enrollment.id); }}
        style={{ color: "var(--color-ink-30)" }}
        title="Cancel sequence"
      >
        <IconX size={11} />
      </button>
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

export function SequencePanel({
  candidateId,
  recruiterId,
  teamId,
  onClose,
}: {
  candidateId: string;
  recruiterId: string;
  teamId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [selectedTemplate, setSelectedTemplate] = useState<PresetTemplate | null>(null);
  // drafts[stepIndex] = draft text (null = not yet generated)
  const [drafts, setDrafts] = useState<(string | null)[]>([]);
  const [generating, setGenerating] = useState<Record<number, boolean>>({});
  const [enrolling, setEnrolling] = useState(false);

  const bonusSeason = isBonusSeason();

  async function generateDraft(stepIdx: number, step: SequenceStep) {
    setGenerating((g) => ({ ...g, [stepIdx]: true }));
    try {
      const res = await fetch("/api/ai/sequence-step-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidateId,
          intent: step.intent,
          channel: step.channel,
        }),
      });
      const json = await res.json() as { draft?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setDrafts((d) => {
        const next = [...d];
        next[stepIdx] = json.draft ?? "";
        return next;
      });
    } catch {
      toast.error("Could not generate draft. Try again.");
    } finally {
      setGenerating((g) => ({ ...g, [stepIdx]: false }));
    }
  }

  function selectTemplate(t: PresetTemplate) {
    setSelectedTemplate(t);
    setDrafts(new Array(t.steps.length).fill(null) as null[]);
  }

  async function handleEnroll() {
    if (!selectedTemplate) return;
    setEnrolling(true);
    try {
      // Save the sequence definition
      const { data: seq, error: seqErr } = await supabase
        .from("outreach_sequences")
        .insert({
          name: selectedTemplate.name,
          steps: selectedTemplate.steps,
          created_by: recruiterId,
          team_id: teamId,
        })
        .select("id")
        .single();
      if (seqErr || !seq) throw seqErr ?? new Error("No sequence returned");

      const firstStep = selectedTemplate.steps[0];
      const sendAt = nextSendAt(new Date(), firstStep.delay_days);

      const { error: enrollErr } = await supabase
        .from("outreach_enrollments")
        .insert({
          sequence_id: (seq as { id: string }).id,
          candidate_id: candidateId,
          current_step: 0,
          next_send_at: sendAt.toISOString(),
          status: "active",
          created_by: recruiterId,
          team_id: teamId,
        });
      if (enrollErr) throw enrollErr;

      toast.success(`Enrolled in "${selectedTemplate.name}". First step due ${sendAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}.`);
      void queryClient.invalidateQueries({ queryKey: ["sequence-enrollment", candidateId] });
      void queryClient.invalidateQueries({ queryKey: ["priority-actions"] });
      onClose();
    } catch {
      toast.error("Could not enroll in sequence. Try again.");
    } finally {
      setEnrolling(false);
    }
  }

  // ─── template selection view ─────────────────────────────────────────────

  if (!selectedTemplate) {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>
            Start sequence
          </p>
          <button onClick={onClose} style={{ color: "var(--color-ink-30)" }}>
            <IconX size={13} />
          </button>
        </div>

        {bonusSeason && (
          <div
            className="text-[11px] px-3 py-2"
            style={{ background: "var(--color-gold-light)", color: "var(--color-gold)", borderLeft: "2px solid var(--color-gold)" }}
          >
            Bonus season (Jan–Mar / Jun–Jul): drafts will avoid urgency framing.
          </div>
        )}

        <div className="space-y-2">
          {PRESET_TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTemplate(t)}
              className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-3"
              style={{ border: "1px solid var(--color-ink-15)", background: "var(--color-white)" }}
            >
              <div>
                <div className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>{t.name}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--color-ink-60)" }}>{t.description}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {t.steps.map((s, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      {s.channel === "email"
                        ? <IconMail size={10} style={{ color: "var(--color-indigo)" }} />
                        : <IconBrandLinkedin size={10} style={{ color: "var(--color-indigo)" }} />}
                      {i < t.steps.length - 1 && (
                        <IconChevronRight size={8} style={{ color: "var(--color-ink-30)" }} />
                      )}
                    </span>
                  ))}
                  <span className="font-mono text-[9px] ml-1" style={{ color: "var(--color-ink-30)" }}>
                    {t.steps.length} steps
                  </span>
                </div>
              </div>
              <IconChevronRight size={13} style={{ color: "var(--color-ink-30)", flexShrink: 0, marginTop: 2 }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── step review view ────────────────────────────────────────────────────

  const allDraftsReady = selectedTemplate.steps.every((_, i) => drafts[i] != null);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedTemplate(null)}
            style={{ color: "var(--color-ink-30)" }}
          >
            <IconChevronDown size={13} style={{ transform: "rotate(90deg)" }} />
          </button>
          <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>
            {selectedTemplate.name}
          </p>
        </div>
        <button onClick={onClose} style={{ color: "var(--color-ink-30)" }}>
          <IconX size={13} />
        </button>
      </div>

      {bonusSeason && (
        <div
          className="text-[11px] px-3 py-2"
          style={{ background: "var(--color-gold-light)", color: "var(--color-gold)", borderLeft: "2px solid var(--color-gold)" }}
        >
          Bonus season active — drafts will avoid urgency framing.
        </div>
      )}

      <div className="space-y-3">
        {selectedTemplate.steps.map((step, idx) => {
          const sendDate = nextSendAt(new Date(), step.delay_days);
          const dateStr = sendDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
          const isGenerating = generating[idx];
          const draft = drafts[idx];

          return (
            <div key={idx} style={{ border: "1px solid var(--color-ink-15)", background: "var(--color-white)" }}>
              {/* Step header */}
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{ borderBottom: "1px solid var(--color-ink-15)", background: "var(--color-ink-05)" }}
              >
                <span
                  className="font-mono text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--color-ink-30)" }}
                >
                  Step {idx + 1}
                </span>
                {step.channel === "email"
                  ? <IconMail size={11} style={{ color: "var(--color-indigo)" }} />
                  : <IconBrandLinkedin size={11} style={{ color: "var(--color-indigo)" }} />}
                <span className="text-[11px]" style={{ color: "var(--color-ink-60)" }}>
                  {step.channel === "email" ? "Email" : "LinkedIn"} · {dateStr}
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => void generateDraft(idx, step)}
                  disabled={isGenerating}
                  className="flex items-center gap-1 text-[11px]"
                  style={{ color: "var(--color-indigo)" }}
                >
                  <IconSparkles size={11} />
                  {isGenerating ? "Generating…" : draft != null ? "Regenerate" : "Draft"}
                </button>
              </div>

              {/* Draft area */}
              <div className="px-3 py-2">
                {draft == null ? (
                  <p className="text-[11px] italic" style={{ color: "var(--color-ink-30)" }}>
                    {step.intent}
                  </p>
                ) : (
                  <textarea
                    value={draft}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrafts((d) => { const n = [...d]; n[idx] = val; return n; });
                    }}
                    rows={6}
                    className="w-full text-[12px] resize-y"
                    style={{
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "var(--color-ink)",
                      fontFamily: "inherit",
                      lineHeight: "1.6",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enroll button */}
      <div className="flex items-center justify-between pt-1">
        {!allDraftsReady && (
          <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            Generate drafts above to review before enrolling.
          </p>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-1"
            onClick={() => void handleEnroll()}
            disabled={enrolling}
          >
            <IconPlayerPlay size={12} />
            {enrolling ? "Enrolling…" : "Enroll candidate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── due-today step card (used by dashboard) ──────────────────────────────────

export type DueEnrollment = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  current_step: number;
  next_send_at: string;
  sequence_name: string;
  steps: SequenceStep[];
};

export function SequenceDueCard({
  enrollment,
  onDraft,
  onAdvance,
}: {
  enrollment: DueEnrollment;
  onDraft: (draft: string) => void;
  onAdvance: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const queryClient = useQueryClient();

  const step = enrollment.steps[enrollment.current_step];
  if (!step) return null;

  async function generateDraft() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/sequence-step-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: enrollment.candidate_id,
          intent: step.intent,
          channel: step.channel,
        }),
      });
      const json = await res.json() as { draft?: string; error?: string };
      if (json.error) throw new Error(json.error);
      const d = json.draft ?? "";
      setDraft(d);
      onDraft(d);
    } catch {
      toast.error("Could not generate draft. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const isLastStep = enrollment.current_step >= enrollment.steps.length - 1;
      if (isLastStep) {
        await supabase
          .from("outreach_enrollments")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", enrollment.id);
        toast.success("Sequence completed.");
      } else {
        const nextStep = enrollment.steps[enrollment.current_step + 1];
        const sendAt = nextSendAt(new Date(), nextStep.delay_days);
        await supabase
          .from("outreach_enrollments")
          .update({
            current_step: enrollment.current_step + 1,
            next_send_at: sendAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", enrollment.id);
        toast.success(`Advanced to step ${enrollment.current_step + 2}. Next send ${sendAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}.`);
      }
      void queryClient.invalidateQueries({ queryKey: ["sequence-enrollment", enrollment.candidate_id] });
      void queryClient.invalidateQueries({ queryKey: ["priority-actions"] });
      onAdvance();
    } catch {
      toast.error("Could not advance sequence. Try again.");
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2">
        {step.channel === "email"
          ? <IconMail size={12} style={{ color: "var(--color-indigo)" }} />
          : <IconBrandLinkedin size={12} style={{ color: "var(--color-indigo)" }} />}
        <span className="text-[11px]" style={{ color: "var(--color-ink-60)" }}>
          {step.channel === "email" ? "Email" : "LinkedIn"} · {enrollment.sequence_name} · step {enrollment.current_step + 1} of {enrollment.steps.length}
        </span>
      </div>

      {draft == null ? (
        <button
          onClick={() => void generateDraft()}
          disabled={generating}
          className="btn btn-outline btn-sm flex items-center gap-1"
        >
          <IconSparkles size={12} />
          {generating ? "Generating…" : "Generate draft"}
        </button>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="w-full text-[12px] resize-y p-2"
          style={{
            border: "1px solid var(--color-ink-15)",
            background: "var(--color-ink-05)",
            color: "var(--color-ink)",
            fontFamily: "inherit",
            lineHeight: "1.6",
          }}
        />
      )}

      <div className="flex items-center gap-2">
        {draft && (
          <button
            onClick={() => { void navigator.clipboard.writeText(draft); toast.success("Copied."); }}
            className="btn btn-ghost btn-sm flex items-center gap-1"
          >
            <IconCheck size={12} />
            Copy
          </button>
        )}
        <button
          onClick={() => void handleAdvance()}
          disabled={advancing}
          className="btn btn-outline btn-sm flex items-center gap-1"
        >
          <IconPlayerPlay size={12} />
          {advancing ? "Advancing…" : enrollment.current_step >= enrollment.steps.length - 1 ? "Mark complete" : "Mark sent · next step"}
        </button>
      </div>
    </div>
  );
}
