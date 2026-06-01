import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSparkles, IconCheck } from "@tabler/icons-react";

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

export function TranscriptPanel({
  candidateId,
  recruiterId,
  onClose,
}: {
  candidateId: string;
  recruiterId: string;
  onClose: () => void;
}) {
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
      const acceptedFields = (result.suggested_field_updates ?? []).filter((_, i) => accepted[`field_${i}`]);
      if (acceptedFields.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: any = {};
        acceptedFields.forEach((f) => { patch[f.field] = f.suggested_value; });
        await supabase.from("candidates").update(patch).eq("id", candidateId);
      }

      const acceptedMots = (result.suggested_motivations ?? []).filter((_, i) => accepted[`mot_${i}`]);
      for (const mot of acceptedMots) {
        await supabase.from("candidate_motivations").upsert(
          { candidate_id: candidateId, rank: mot.rank, motivation_text: mot.detail, motivation_type: mot.motivation_type },
          { onConflict: "candidate_id,rank" },
        );
      }

      const acceptedBlk = (result.suggested_blockers ?? []).filter((_, i) => accepted[`blk_${i}`]);
      for (const blk of acceptedBlk) {
        await supabase.from("candidate_blockers").insert({ candidate_id: candidateId, theme: blk.theme, detail: blk.detail, is_risk: blk.is_risk });
      }

      const acceptedCI = (result.suggested_competing_interviews ?? []).filter((_, i) => accepted[`ci_${i}`]);
      for (const ci of acceptedCI) {
        await supabase.from("competing_interviews").insert({ candidate_id: candidateId, company_name: ci.company_name, stage: ci.stage, source: ci.source, disclosed_at: result.interacted_at, is_active: true });
      }

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

      await Promise.all([
        supabase.from("candidates").update({ last_interaction_at: now }).eq("id", candidateId),
        supabase.from("processes")
          .update({ last_activity_at: now })
          .eq("candidate_id", candidateId)
          .not("stage", "in", '("Placed","Closed lost")'),
      ]);

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
