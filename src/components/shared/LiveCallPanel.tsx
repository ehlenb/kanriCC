import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconPhone, IconSparkles } from "@tabler/icons-react";

type Props = {
  open: boolean;
  onClose: () => void;
  phone?: string | null;
  personName?: string;
  candidateId?: string;
  clientId?: string;
  contactId?: string;
  onSaved?: () => void;
};

export function LiveCallPanel({
  open,
  onClose,
  phone,
  personName,
  candidateId,
  clientId,
  contactId,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    if (open) setNotes("");
  }, [open]);

  async function saveNotes(text: string) {
    if (!text.trim()) {
      toast.error("Add some notes before saving.");
      return;
    }
    if (!user?.id) {
      toast.error("Not signed in.");
      return;
    }
    setSaving(true);
    const summary = text.trim().split(/[\n.]/)[0].trim().slice(0, 160);

    const { error } = await supabase.from("interactions").insert({
      recruiter_id: user.id,
      interaction_type: "call",
      primary_party: candidateId ? "candidate" : "client",
      interacted_at: new Date().toISOString(),
      summary,
      full_notes: text.trim(),
      candidate_id: candidateId ?? null,
      client_id: clientId ?? null,
      contact_id: contactId ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not save call notes.");
      return;
    }
    toast.success("Call logged.");
    onSaved?.();
    onClose();
  }

  async function handleKanriSave() {
    if (!notes.trim()) {
      toast.error("Add some notes before saving.");
      return;
    }
    setPolishing(true);
    try {
      const resp = await fetch("/api/ai/polish-call-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_notes: notes, candidate_name: personName }),
      });
      const json = (await resp.json()) as { data?: { polished: string }; error?: string };
      if (json.error || !json.data?.polished) {
        toast.error("Could not polish notes. Saving raw notes instead.");
        await saveNotes(notes);
        return;
      }
      await saveNotes(json.data.polished);
    } catch {
      toast.error("Could not reach AI. Saving raw notes instead.");
      await saveNotes(notes);
    } finally {
      setPolishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle className="font-display text-base flex items-center gap-2">
            <IconPhone size={15} />
            {personName ? `Call — ${personName}` : "Live call notes"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {phone && (
            <div className="flex items-center justify-between px-3 py-2" style={{ background: "var(--color-ink-05)", border: "0.5px solid var(--color-ink-15)" }}>
              <span className="text-[13px] font-mono" style={{ color: "var(--color-ink-60)" }}>{phone}</span>
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="btn btn-primary btn-sm flex items-center gap-1"
              >
                <IconPhone size={12} />
                Call now
              </a>
            </div>
          )}

          <Textarea
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Type notes as you talk — key points, what was agreed, next steps…"
            rows={10}
            className="text-[13px] resize-none"
          />
          <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
            <strong>Save</strong> keeps your raw notes as typed.
            {" "}<strong>Kanri Save ✦</strong> polishes them into a clean summary using AI before logging.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving || polishing}>
            Cancel
          </Button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => void saveNotes(notes)}
            disabled={saving || polishing || !notes.trim()}
          >
            {saving && !polishing ? "Saving…" : "Save"}
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => void handleKanriSave()}
            disabled={saving || polishing || !notes.trim()}
          >
            <IconSparkles size={13} />
            {polishing ? "Polishing…" : "Kanri Save ✦"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
