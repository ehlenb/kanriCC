import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Placement post-mortem, UI step (Wave 6, piece 2). Shown right after a
// process is saved as Placed or Closed lost. Generates a five-line draft the
// recruiter can edit, then "Save to record" inserts it as an interaction with
// triggers_context_refresh so the existing pgmq/pg_cron pipeline folds it
// into both entities' ai_context on its own -- the Memory Doctrine, not a new
// memory-writing path (CLAUDE.md Section 2).

export function PostMortemPrompt({
  open,
  processId,
  stage,
  candidateId,
  clientId,
  recruiterId,
  onClose,
}: {
  open: boolean;
  processId: string | null;
  stage: "Placed" | "Closed lost" | null;
  candidateId: string;
  clientId: string | null;
  recruiterId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setContent(null);
    setLoading(false);
  }

  async function generate() {
    if (!processId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai?type=placement-postmortem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_id: processId }),
      });
      const json = (await res.json()) as { content?: string; error?: string };
      if (json.error || !json.content) {
        toast.error(json.error ?? "Could not generate post-mortem. Try again.");
        return;
      }
      setContent(json.content);
    } catch {
      toast.error("Could not generate post-mortem. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveToRecord() {
    if (!content) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("interactions").insert({
        candidate_id: candidateId,
        client_id: clientId,
        process_id: processId,
        recruiter_id: recruiterId,
        interaction_type: "note",
        primary_party: "candidate",
        summary: `Post-mortem: ${stage}`,
        full_notes: content,
        interacted_at: new Date().toISOString(),
        triggers_context_refresh: true,
      });
      if (error) throw error;
      toast.success("Saved to the candidate and client record.");
      reset();
      onClose();
    } catch {
      toast.error("Could not save the post-mortem. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            {content ? "Post-mortem draft" : `Generate a post-mortem?`}
          </DialogTitle>
        </DialogHeader>

        {!content ? (
          <p className="text-[13px] py-2" style={{ color: "var(--color-ink-60)" }}>
            Five lines on what worked or what went wrong here, for your own record and the next brief on this candidate and client.
          </p>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            className="text-[13px] font-sans resize-none"
          />
        )}

        <DialogFooter className="gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => { reset(); onClose(); }} disabled={loading || saving}>
            Skip
          </button>
          {!content ? (
            <button className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={loading}>
              {loading ? "Generating…" : "Generate"}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => void saveToRecord()} disabled={saving}>
              {saving ? "Saving…" : "Save to record"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
