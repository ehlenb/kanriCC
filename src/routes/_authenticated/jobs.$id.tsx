import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import { formatYen, relativeTime, stageOrder, initials } from "@/lib/candidate-utils";
import { StageBadge } from "@/components/shared/StageBadge";
import { Card } from "@/components/shared/Card";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  IconSparkles,
  IconPlus,
  IconTrash,
  IconChevronLeft,
  IconAlertTriangle,
  IconX,
} from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  component: JobDetail,
});

// ─── types ────────────────────────────────────────────────────────────────────

type Requisition = {
  id: string;
  title: string;
  is_open: boolean;
  urgency: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_stretch: number | null;
  strategic_context: string | null;
  interview_steps: number | null;
  interview_notes: string | null;
  jd_url: string | null;
  jd_text: string | null;
  client_id: string;
  clients: { id: string; company_name: string } | null;
};

type Condition = {
  id: string;
  condition_text: string;
  condition_type: string;
  source: string;
  priority_rank: number;
};

type ProcessCard = {
  id: string;
  stage: string;
  last_activity_at: string | null;
  coverage_type: string;
  candidate_id: string;
  candidate_name: string;
};

type MatchResult = {
  candidate_id: string;
  candidate_name: string;
  score: number;
  match_reason: string;
  is_salary_stretch: boolean;
  current_title: string | null;
  current_company: string | null;
  japanese_level: string | null;
  expected_total_min: number | null;
};

// ─── data hooks ───────────────────────────────────────────────────────────────

function useRequisition(id: string) {
  return useQuery({
    queryKey: ["requisition", id],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<Requisition | null> => {
      const { data, error } = await supabase
        .from("requisitions")
        .select(
          "id, title, is_open, urgency, salary_min, salary_max, salary_stretch, strategic_context, interview_steps, interview_notes, jd_url, jd_text, client_id, clients ( id, company_name )",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        clients: Array.isArray(data.clients) ? (data.clients[0] ?? null) : data.clients,
      } as Requisition;
    },
  });
}

function useConditions(requisitionId: string) {
  return useQuery({
    queryKey: ["requisition_conditions", requisitionId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<Condition[]> => {
      const { data, error } = await supabase
        .from("requisition_conditions")
        .select("id, condition_text, condition_type, source, priority_rank")
        .eq("requisition_id", requisitionId)
        .order("priority_rank");
      if (error) throw error;
      return (data ?? []) as Condition[];
    },
  });
}

function useProcesses(requisitionId: string) {
  return useQuery({
    queryKey: ["req_processes", requisitionId],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<ProcessCard[]> => {
      const { data, error } = await supabase
        .from("processes")
        .select("id, stage, last_activity_at, coverage_type, candidate_id, candidates ( full_name )")
        .eq("requisition_id", requisitionId);
      if (error) throw error;
      return (data ?? []).map((p) => {
        const cand = Array.isArray(p.candidates) ? p.candidates[0] : p.candidates;
        return {
          id: p.id,
          stage: p.stage,
          last_activity_at: p.last_activity_at,
          coverage_type: p.coverage_type,
          candidate_id: p.candidate_id,
          candidate_name: (cand as { full_name?: string } | null)?.full_name ?? "—",
        };
      });
    },
  });
}

// ─── component ────────────────────────────────────────────────────────────────

function JobDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const recruiterId = user!.id;
  const navigate = useNavigate();

  const req = useRequisition(id);
  const conditions = useConditions(id);
  const processes = useProcesses(id);

  const [showMatch, setShowMatch] = useState(false);

  if (req.isLoading) {
    return (
      <div className="px-8 py-7 max-w-6xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-[1fr_420px] gap-5 mt-4">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!req.data) {
    return (
      <div className="px-8 py-7">
        <p className="text-[13px]" style={{ color: "#888780" }}>Requisition not found.</p>
      </div>
    );
  }

  const r = req.data;
  const activeProcesses = (processes.data ?? []).filter(
    (p) => !["Placed", "Closed lost"].includes(p.stage),
  );

  const urgencyStyles: Record<string, { bg: string; color: string }> = {
    critical: { bg: "#fcebeb", color: "#a32d2d" },
    high:     { bg: "#fdf3e7", color: "#633806" },
    normal:   { bg: "#f5f5f3", color: "#888780" },
    low:      { bg: "#f5f5f3", color: "#888780" },
  };
  const urgency = urgencyStyles[r.urgency ?? "normal"] ?? urgencyStyles.normal;

  return (
    <div className="px-8 py-7 max-w-6xl">
      {/* Back nav */}
      <button
        className="flex items-center gap-1 text-[12px] mb-4 hover:opacity-70 transition-opacity"
        style={{ color: "#5f5e5a" }}
        onClick={() => void navigate({ to: "/jobs" })}
      >
        <IconChevronLeft size={13} />
        Jobs
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-medium">{r.title}</h1>
            {r.urgency && r.urgency !== "normal" && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded"
                style={{ background: urgency.bg, color: urgency.color }}
              >
                {r.urgency.charAt(0).toUpperCase() + r.urgency.slice(1)}
              </span>
            )}
            {!r.is_open && (
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded"
                style={{ background: "#f5f5f3", color: "#888780" }}
              >
                Closed
              </span>
            )}
          </div>
          <p className="text-[13px]" style={{ color: "#5f5e5a" }}>
            {r.clients?.company_name ?? "—"}&nbsp;
            {(r.salary_min || r.salary_max) && (
              <span>
                &middot; {formatYen(r.salary_min)}–{formatYen(r.salary_max)}
                {r.salary_stretch && <span> (stretch {formatYen(r.salary_stretch)})</span>}
              </span>
            )}
          </p>
        </div>

        <button className="ab" onClick={() => setShowMatch((v) => !v)}>
          <IconSparkles size={13} />
          {showMatch ? "Hide matches" : "Match candidates"}
        </button>
      </div>

      {/* Match panel — full width when open */}
      {showMatch && (
        <MatchCandidatesPanel
          requisitionId={id}
          recruiterId={recruiterId}
          onClose={() => setShowMatch(false)}
        />
      )}

      {/* Two-column layout */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 400px" }}>
        {/* ── Left: requisition details ── */}
        <div className="space-y-3">
          <JdViewer jdUrl={r.jd_url} jdText={r.jd_text} />

          <StrategicContextCard requisitionId={id} value={r.strategic_context} />

          {/* Salary + interview */}
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <SectionLabel>Salary range</SectionLabel>
                <p className="text-[13px] font-medium">
                  {formatYen(r.salary_min)} – {formatYen(r.salary_max)}
                </p>
                {r.salary_stretch && (
                  <p className="text-[12px] mt-0.5" style={{ color: "#5f5e5a" }}>
                    Stretch: {formatYen(r.salary_stretch)}
                  </p>
                )}
              </div>
              <div>
                <SectionLabel>Interview process</SectionLabel>
                <p className="text-[13px]">
                  {r.interview_steps ? `${r.interview_steps} round${r.interview_steps !== 1 ? "s" : ""}` : "—"}
                </p>
                {r.interview_notes && (
                  <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "#5f5e5a" }}>
                    {r.interview_notes}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <ConditionsCard
            requisitionId={id}
            recruiterId={recruiterId}
            conditions={conditions.data ?? []}
            isLoading={conditions.isLoading}
          />
        </div>

        {/* ── Right: pipeline ── */}
        <div>
          <PipelinePanel
            processes={processes.data ?? []}
            isLoading={processes.isLoading}
            activeCount={activeProcesses.length}
          />
        </div>
      </div>
    </div>
  );
}

// ─── JD viewer ────────────────────────────────────────────────────────────────

function JdViewer({
  jdUrl,
  jdText,
}: {
  jdUrl: string | null;
  jdText: string | null;
}) {
  const signedUrl = useQuery({
    queryKey: ["jd-signed-url", jdUrl],
    staleTime: 50 * 60 * 1000,
    retry: 0,
    enabled: !!jdUrl,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("resumes")
        .createSignedUrl(jdUrl!, 3600);
      if (error) return null;
      return data.signedUrl;
    },
  });

  if (!jdUrl && !jdText) return null;

  return (
    <Card>
      <SectionLabel className="mb-2">Job description</SectionLabel>
      {jdUrl && signedUrl.data ? (
        <iframe
          src={signedUrl.data}
          title="Job description"
          className="w-full rounded"
          style={{ height: 480, border: "0.5px solid rgba(26,26,24,0.12)" }}
        />
      ) : jdText && !jdText.startsWith("[PDF") ? (
        <pre
          className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans overflow-auto"
          style={{ color: "#1a1a18", maxHeight: 420 }}
        >
          {jdText}
        </pre>
      ) : (
        <p className="text-[12px]" style={{ color: "#888780" }}>
          {signedUrl.isLoading ? "Loading JD…" : "JD not available."}
        </p>
      )}
    </Card>
  );
}

// ─── strategic context ────────────────────────────────────────────────────────

function StrategicContextCard({
  requisitionId,
  value,
}: {
  requisitionId: string;
  value: string | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(value ?? "");
  const saved = useRef(value ?? "");

  const mutation = useMutation({
    mutationFn: async (v: string) => {
      const { error } = await supabase
        .from("requisitions")
        .update({ strategic_context: v || null })
        .eq("id", requisitionId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requisition", requisitionId] });
    },
    onError: () => toast.error("Could not save. Try again."),
  });

  function handleBlur() {
    if (text !== saved.current) {
      saved.current = text;
      mutation.mutate(text);
    }
  }

  return (
    <Card>
      <SectionLabel className="mb-2">Strategic context</SectionLabel>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Why is this role open? What's the hiring manager's real priority? Add context that helps pitch the role…"
        rows={4}
        className="w-full text-[13px] leading-relaxed resize-none outline-none bg-transparent"
        style={{ color: "#1a1a18" }}
      />
    </Card>
  );
}

// ─── conditions card ──────────────────────────────────────────────────────────

function ConditionsCard({
  requisitionId,
  recruiterId,
  conditions,
  isLoading,
}: {
  requisitionId: string;
  recruiterId: string;
  conditions: Condition[];
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newType, setNewType] = useState<"must_have" | "nice_to_have">("must_have");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const nextRank = conditions.length
    ? Math.max(...conditions.map((c) => c.priority_rank)) + 1
    : 1;

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("requisition_conditions").insert({
        requisition_id: requisitionId,
        recruiter_id: recruiterId,
        condition_text: newText.trim(),
        condition_type: newType,
        source: "recruiter",
        priority_rank: nextRank,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requisition_conditions", requisitionId] });
      setNewText("");
      setAdding(false);
    },
    onError: () => toast.error("Could not add condition. Try again."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase
        .from("requisition_conditions")
        .update({ condition_text: text })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requisition_conditions", requisitionId] });
      setEditingId(null);
    },
    onError: () => toast.error("Could not update condition. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (conditionId: string) => {
      const { error } = await supabase
        .from("requisition_conditions")
        .delete()
        .eq("id", conditionId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requisition_conditions", requisitionId] });
    },
    onError: () => toast.error("Could not delete condition. Try again."),
  });

  const mustHave = conditions.filter((c) => c.condition_type === "must_have");
  const niceToHave = conditions.filter((c) => c.condition_type === "nice_to_have");

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel className="mb-0">Key conditions</SectionLabel>
        <button className="ab" onClick={() => setAdding((v) => !v)}>
          <IconPlus size={11} /> Add
        </button>
      </div>

      {isLoading && <Skeleton className="h-16 w-full" />}

      {!isLoading && conditions.length === 0 && !adding && (
        <p className="text-[12px]" style={{ color: "#888780" }}>
          No conditions extracted yet. Upload a JD or add manually.
        </p>
      )}

      {mustHave.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium mb-1.5 uppercase tracking-[0.04em]" style={{ color: "#633806" }}>
            Must-have
          </p>
          <div className="space-y-1.5">
            {mustHave.map((c) => (
              <ConditionRow
                key={c.id}
                condition={c}
                type="must_have"
                editingId={editingId}
                editText={editText}
                onStartEdit={(cond) => { setEditingId(cond.id); setEditText(cond.condition_text); }}
                onSaveEdit={(cond) => updateMutation.mutate({ id: cond.id, text: editText })}
                onCancelEdit={() => setEditingId(null)}
                onEditTextChange={setEditText}
                onDelete={(cid) => deleteMutation.mutate(cid)}
              />
            ))}
          </div>
        </div>
      )}

      {niceToHave.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium mb-1.5 uppercase tracking-[0.04em]" style={{ color: "#5f5e5a" }}>
            Nice-to-have
          </p>
          <div className="space-y-1.5">
            {niceToHave.map((c) => (
              <ConditionRow
                key={c.id}
                condition={c}
                type="nice_to_have"
                editingId={editingId}
                editText={editText}
                onStartEdit={(cond) => { setEditingId(cond.id); setEditText(cond.condition_text); }}
                onSaveEdit={(cond) => updateMutation.mutate({ id: cond.id, text: editText })}
                onCancelEdit={() => setEditingId(null)}
                onEditTextChange={setEditText}
                onDelete={(cid) => deleteMutation.mutate(cid)}
              />
            ))}
          </div>
        </div>
      )}

      {adding && (
        <div
          className="rounded-lg p-3 mt-2 space-y-2"
          style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.12)" }}
        >
          <input
            autoFocus
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Condition text…"
            className="w-full text-[13px] bg-transparent outline-none"
            style={{ color: "#1a1a18" }}
            onKeyDown={(e) => { if (e.key === "Enter" && newText.trim()) addMutation.mutate(); }}
          />
          <div className="flex items-center gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "must_have" | "nice_to_have")}
              className="text-[12px] bg-white rounded px-2 py-1 outline-none"
              style={{ border: "0.5px solid rgba(26,26,24,0.12)", color: "#1a1a18" }}
            >
              <option value="must_have">Must-have</option>
              <option value="nice_to_have">Nice-to-have</option>
            </select>
            <button
              className="ab"
              disabled={!newText.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Save
            </button>
            <button
              className="text-[12px]"
              style={{ color: "#888780" }}
              onClick={() => { setAdding(false); setNewText(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ConditionRow({
  condition: c,
  type,
  editingId,
  editText,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTextChange,
  onDelete,
}: {
  condition: Condition;
  type: "must_have" | "nice_to_have";
  editingId: string | null;
  editText: string;
  onStartEdit: (c: Condition) => void;
  onSaveEdit: (c: Condition) => void;
  onCancelEdit: () => void;
  onEditTextChange: (v: string) => void;
  onDelete: (id: string) => void;
}) {
  const dotColor = type === "must_have" ? "#ef9f27" : "#b8b7b2";

  if (editingId === c.id) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          className="flex-1 text-[12px] bg-white rounded px-2 py-1 outline-none"
          style={{ border: "0.5px solid rgba(26,26,24,0.2)", color: "#1a1a18" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit(c);
            if (e.key === "Escape") onCancelEdit();
          }}
        />
        <button className="ab text-[11px]" onClick={() => onSaveEdit(c)}>Save</button>
        <button className="text-[11px]" style={{ color: "#888780" }} onClick={onCancelEdit}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <span className="mt-[5px] shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      <button
        className="flex-1 text-left text-[12px] leading-snug hover:underline"
        style={{ color: "#1a1a18" }}
        onClick={() => onStartEdit(c)}
      >
        {c.condition_text}
        {c.source === "client" && (
          <span className="ml-1.5 text-[11px]" style={{ color: "#888780" }}>(client)</span>
        )}
      </button>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onDelete(c.id)}
        title="Delete"
      >
        <IconTrash size={12} style={{ color: "#b8b7b2" }} />
      </button>
    </div>
  );
}

// ─── pipeline panel ───────────────────────────────────────────────────────────

function PipelinePanel({
  processes,
  isLoading,
  activeCount,
}: {
  processes: ProcessCard[];
  isLoading: boolean;
  activeCount: number;
}) {
  const navigate = useNavigate();

  const active = processes
    .filter((p) => !["Placed", "Closed lost"].includes(p.stage))
    .sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));

  const closed = processes.filter((p) => ["Placed", "Closed lost"].includes(p.stage));

  const grouped = active.reduce<Record<string, ProcessCard[]>>((acc, p) => {
    (acc[p.stage] ??= []).push(p);
    return acc;
  }, {});

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel className="mb-0">
          Pipeline{activeCount > 0 ? ` · ${activeCount} active` : ""}
        </SectionLabel>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {!isLoading && processes.length === 0 && (
        <p className="text-[12px]" style={{ color: "#888780" }}>
          No candidates in pipeline for this role yet.
        </p>
      )}

      {Object.entries(grouped).map(([stage, group]) => (
        <div key={stage} className="mb-3">
          <p className="text-[11px] font-medium mb-1.5 uppercase tracking-[0.04em]" style={{ color: "#5f5e5a" }}>
            {stage} · {group.length}
          </p>
          <div className="space-y-1.5">
            {group.map((p) => (
              <button
                key={p.id}
                className="w-full text-left flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors"
                style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#eeede8"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#f5f5f3"; }}
                onClick={() => void navigate({ to: "/candidates/$id", params: { id: p.candidate_id }, search: BLANK_CANDIDATE_SEARCH })}
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                  style={{ background: "#fff", color: "#5f5e5a", border: "0.5px solid rgba(26,26,24,0.12)" }}
                >
                  {initials(p.candidate_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate">{p.candidate_name}</p>
                  {p.last_activity_at && (
                    <p className="text-[11px]" style={{ color: "#888780" }}>
                      {relativeTime(p.last_activity_at)}
                    </p>
                  )}
                </div>
                <StageBadge stage={p.stage} />
              </button>
            ))}
          </div>
        </div>
      ))}

      {closed.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid rgba(26,26,24,0.08)" }}>
          <p className="text-[11px] font-medium mb-1.5 uppercase tracking-[0.04em]" style={{ color: "#888780" }}>
            Closed · {closed.length}
          </p>
          <div className="space-y-1">
            {closed.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg opacity-50"
                style={{ background: "#f5f5f3" }}
              >
                <span className="text-[12px] flex-1">{p.candidate_name}</span>
                <StageBadge stage={p.stage} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── match candidates panel ───────────────────────────────────────────────────

function MatchCandidatesPanel({
  requisitionId,
  recruiterId,
  onClose,
}: {
  requisitionId: string;
  recruiterId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const matchQuery = useQuery({
    queryKey: ["match_candidates", requisitionId],
    staleTime: 0,
    retry: 0,
    queryFn: async (): Promise<MatchResult[]> => {
      const resp = await fetch("/api/ai/match-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requisition_id: requisitionId, recruiter_id: recruiterId }),
      });
      const data = (await resp.json()) as { matches?: MatchResult[]; error?: string };
      if (data.error) throw new Error(data.error);
      return data.matches ?? [];
    },
  });

  const specMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase.from("processes").insert({
        candidate_id: candidateId,
        requisition_id: requisitionId,
        owner_recruiter_id: recruiterId,
        stage: "Specs Sent",
        coverage_type: "own",
      });
      if (error) throw error;
      return candidateId;
    },
    onSuccess: (candidateId) => {
      void qc.invalidateQueries({ queryKey: ["req_processes", requisitionId] });
      toast.success("Process created at Specs Sent.");
      void navigate({ to: "/candidates/$id", params: { id: candidateId }, search: BLANK_CANDIDATE_SEARCH });
    },
    onError: () => toast.error("Could not create process. Try again."),
  });

  const visible = (matchQuery.data ?? []).filter((m) => !skipped.has(m.candidate_id));

  return (
    <div
      className="rounded-xl p-5 mb-5"
      style={{ background: "#fff", border: "0.5px solid rgba(26,26,24,0.12)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="sl mb-0">AI candidate matches</p>
          {matchQuery.data && (
            <p className="text-[12px] mt-0.5" style={{ color: "#5f5e5a" }}>
              {visible.length} candidate{visible.length !== 1 ? "s" : ""} ranked by fit
            </p>
          )}
        </div>
        <button onClick={onClose}>
          <IconX size={16} style={{ color: "#888780" }} />
        </button>
      </div>

      {matchQuery.isLoading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          <p className="text-[12px] text-center" style={{ color: "#888780" }}>
            Ranking candidates — this takes a moment…
          </p>
        </div>
      )}

      {matchQuery.isError && (
        <p className="text-[13px]" style={{ color: "#a32d2d" }}>
          Could not rank candidates. Try again.
        </p>
      )}

      {!matchQuery.isLoading && !matchQuery.isError && visible.length === 0 && (
        <p className="text-[13px]" style={{ color: "#888780" }}>
          No eligible candidates found. All active and passive candidates may already be in this pipeline.
        </p>
      )}

      <div className="space-y-2">
        {visible.map((m) => (
          <div
            key={m.candidate_id}
            className="rounded-lg p-4"
            style={{ background: "#f5f5f3", border: "0.5px solid rgba(26,26,24,0.08)" }}
          >
            <div className="flex items-start gap-3">
              {/* Score */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold"
                style={{
                  background: m.score >= 7 ? "#eaf3de" : m.score >= 5 ? "#fdf3e7" : "#f5f5f3",
                  color: m.score >= 7 ? "#27500a" : m.score >= 5 ? "#633806" : "#888780",
                }}
              >
                {m.score}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-medium">{m.candidate_name}</span>
                  {m.is_salary_stretch && (
                    <span
                      className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
                      style={{ background: "#fdf3e7", color: "#633806" }}
                    >
                      <IconAlertTriangle size={10} />
                      Salary stretch
                    </span>
                  )}
                </div>
                <p className="text-[12px] mb-1" style={{ color: "#5f5e5a" }}>
                  {[m.current_title, m.current_company].filter(Boolean).join(" at ")}
                  {m.japanese_level && <span className="ml-2">&middot; JA: {m.japanese_level}</span>}
                  {m.expected_total_min && (
                    <span className="ml-2">&middot; exp. {formatYen(m.expected_total_min)}+</span>
                  )}
                </p>
                <p className="text-[12px] leading-snug" style={{ color: "#1a1a18" }}>
                  {m.match_reason}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 shrink-0">
                <button
                  className="ab"
                  disabled={specMutation.isPending}
                  onClick={() => specMutation.mutate(m.candidate_id)}
                >
                  Spec
                </button>
                <button
                  className="text-[12px] px-2 py-1 rounded"
                  style={{ color: "#888780" }}
                  onClick={() => setSkipped((s) => new Set([...s, m.candidate_id]))}
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
