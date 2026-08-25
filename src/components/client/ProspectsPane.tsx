import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconSparkles, IconArrowRight } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Prospect and BD pipeline (Wave 6, piece 5): target companies before they
// are clients. Lives inside the Clients page (a toggle, not a 6th sidebar
// item) per CLAUDE.md Section 13's nav discipline. "Convert to client"
// creates a real clients row and locks the prospect at Won -- kept as a
// separate table from clients rather than a shared type-flagged row, since
// clients carries contract-specific columns that don't apply pre-signature.

const STAGES = ["Identified", "Researched", "Contacted", "Meeting", "Proposal", "Won", "Lost"] as const;

type Prospect = {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  stage: string;
  source: string | null;
  notes: string | null;
  research_notes: string | null;
  bd_trigger_notes: string | null;
  last_contacted_at: string | null;
  converted_to_client_id: string | null;
};

export function ProspectDetailPanel({
  prospectId,
  recruiterId,
  onConverted,
}: {
  prospectId: string | null;
  recruiterId: string;
  onConverted: (clientId: string) => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<string | null>(null);
  const [checkingSignals, setCheckingSignals] = useState(false);
  const [converting, setConverting] = useState(false);

  const { data: prospect } = useQuery({
    queryKey: ["prospects", "detail", prospectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("prospects").select("*").eq("id", prospectId!).single();
      if (error) throw error;
      return data as Prospect;
    },
    enabled: !!prospectId,
  });

  if (!prospectId) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--color-ink-30)" }}>
        Select a prospect, or add a new one.
      </div>
    );
  }
  if (!prospect) return null;

  const displayNotes = notes ?? prospect.notes ?? "";

  async function updateStage(stage: string) {
    const { error } = await supabase.from("prospects").update({ stage, updated_at: new Date().toISOString() }).eq("id", prospectId!);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["prospects"] });
  }

  async function saveNotes() {
    const { error } = await supabase.from("prospects").update({ notes: displayNotes, updated_at: new Date().toISOString() }).eq("id", prospectId!);
    if (error) toast.error(error.message);
  }

  async function checkSignals() {
    setCheckingSignals(true);
    try {
      const res = await fetch("/api/ai?type=bd-trigger-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId }),
      });
      const json = (await res.json()) as { bd_trigger_notes?: string; error?: string };
      if (json.error) { toast.error(json.error); return; }
      void qc.invalidateQueries({ queryKey: ["prospects"] });
    } catch {
      toast.error("Signal check failed. Try again.");
    } finally {
      setCheckingSignals(false);
    }
  }

  async function convertToClient(current: Prospect) {
    setConverting(true);
    try {
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .insert({ recruiter_id: recruiterId, company_name: current.company_name, website: current.website })
        .select("id")
        .single();
      if (clientErr) throw clientErr;

      const { error: prospectErr } = await supabase
        .from("prospects")
        .update({ stage: "Won", converted_to_client_id: client.id, updated_at: new Date().toISOString() })
        .eq("id", current.id);
      if (prospectErr) throw prospectErr;

      toast.success(`${current.company_name} is now a client.`);
      onConverted(client.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not convert. Try again.");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-display font-semibold">{prospect.company_name}</h2>
        {!prospect.converted_to_client_id && (
          <button onClick={() => void convertToClient(prospect)} disabled={converting} className="btn btn-accent btn-sm flex items-center gap-1">
            {converting ? "Converting…" : "Convert to client"} <IconArrowRight size={12} />
          </button>
        )}
      </div>
      {prospect.industry && <p className="text-[13px] mb-4" style={{ color: "var(--color-ink-60)" }}>{prospect.industry}</p>}

      <div className="mb-5">
        <p className="label mb-1">Stage</p>
        <select
          value={prospect.stage}
          onChange={(e) => void updateStage(e.target.value)}
          disabled={!!prospect.converted_to_client_id}
          className="text-[13px] px-2 py-1.5 outline-none"
          style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-white)" }}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mb-5">
        <p className="label mb-1">BD signal check</p>
        <button onClick={() => void checkSignals()} disabled={checkingSignals} className="btn btn-outline btn-sm flex items-center gap-1 mb-2">
          <IconSparkles size={12} />
          {checkingSignals ? "Checking…" : "Check for signals"}
        </button>
        {prospect.bd_trigger_notes && (
          <p className="text-[13px] p-3" style={{ background: "var(--color-ink-10)", color: "var(--color-ink)" }}>
            {prospect.bd_trigger_notes}
          </p>
        )}
      </div>

      {prospect.research_notes && (
        <div className="mb-5">
          <p className="label mb-1">Research notes</p>
          <p className="text-[13px]" style={{ color: "var(--color-ink)" }}>{prospect.research_notes}</p>
        </div>
      )}

      <div>
        <p className="label mb-1">Notes</p>
        <Textarea
          value={displayNotes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
          rows={4}
          placeholder="Recruiter notes…"
          className="text-[13px] font-sans resize-none"
        />
      </div>
    </div>
  );
}

export function NewProspectDialog({
  open,
  onClose,
  onCreated,
  recruiterId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  recruiterId: string;
}) {
  const [form, setForm] = useState({ company_name: "", industry: "", website: "", source: "" });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.company_name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("prospects")
      .insert({
        owner_recruiter_id: recruiterId,
        company_name: form.company_name.trim(),
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        source: form.source.trim() || null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setForm({ company_name: "", industry: "", website: "", source: "" });
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a prospect</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Company name *</Label>
            <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industry</Label>
            <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Website</Label>
            <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder="e.g. referral, conference" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !form.company_name.trim()}>Add prospect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
