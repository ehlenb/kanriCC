import { useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSend, IconSparkles, IconPaperclip, IconDeviceFloppy } from "@tabler/icons-react";
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  type TemplateCategory,
} from "@/hooks/useEmailTemplates";

// EmailComposerDialog — the candidate-page "Email" pill. Three modes:
//  - plain:    free email to the candidate, logged interaction_type "email"
//  - job_spec: JD + spec to the candidate for buy-in; attach the JD file,
//              AI-draft via spec-email; logged "email job spec sent",
//              cross-linked to candidate + requisition + client
//  - client:   email to a client contact about this candidate (CV send,
//              feedback...). Candidate is never a recipient but the activity
//              still logs on the candidate page. CV attachable.
// Templates (a dropdown + save-as-template) are Phase 2.

type Mode = "plain" | "job_spec" | "client";

type Props = {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName?: string | null;
  candidateEmail?: string;
  onSent?: () => void;
};

type OpenReq = {
  id: string;
  title: string;
  jd_url: string | null;
  client_id: string;
  clients: { company_name: string } | null;
};

type Contact = { id: string; name: string; email: string | null; is_primary: boolean | null };

const NONE = "__none__";

function cleanFilename(path: string, fallback: string): string {
  const base = path.split("/").pop() ?? fallback;
  return base.replace(/^\d+_/, "") || fallback;
}

export function EmailComposerDialog({
  open,
  onClose,
  candidateId,
  candidateName,
  candidateEmail = "",
  onSent,
}: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("plain");
  const [to, setTo] = useState(candidateEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [jobId, setJobId] = useState<string>(NONE);
  const [manualClientId, setManualClientId] = useState<string>(NONE);
  const [contactId, setContactId] = useState<string>(NONE);
  const [attachJd, setAttachJd] = useState(false);
  const [attachCv, setAttachCv] = useState(false);
  const [cvField, setCvField] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [templateId, setTemplateId] = useState<string>(NONE);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplVisibility, setTplVisibility] = useState<"team" | "private">("team");

  const { data: templates = [] } = useEmailTemplates();
  const createTemplate = useCreateEmailTemplate();

  const modeCategory: TemplateCategory =
    mode === "job_spec" ? "job_spec" : mode === "client" ? "client" : "general";
  const templateChoices = templates.filter(
    (t) => t.category === modeCategory || t.category === "general",
  );

  // Reset everything each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setMode("plain");
    setTo(candidateEmail);
    setSubject("");
    setBody("");
    setJobId(NONE);
    setManualClientId(NONE);
    setContactId(NONE);
    setAttachJd(false);
    setAttachCv(false);
    setCvField("");
    setTemplateId(NONE);
    setSavingTpl(false);
    setTplName("");
    setTplVisibility("team");
  }
  if (!open && wasOpen) setWasOpen(false);

  const { data: openReqs = [] } = useQuery({
    queryKey: ["composer-open-reqs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("requisitions")
        .select("id, title, jd_url, client_id, clients ( company_name )")
        .eq("is_open", true)
        .order("title");
      return (data ?? []) as unknown as OpenReq[];
    },
    staleTime: 30_000,
    retry: 1,
    enabled: open && mode !== "plain",
  });

  const { data: clientsList = [] } = useQuery({
    queryKey: ["clients-list-slim"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, company_name")
        .order("company_name")
        .limit(200);
      return (data ?? []) as { id: string; company_name: string }[];
    },
    staleTime: 30_000,
    retry: 1,
    enabled: open && mode === "client",
  });

  const selectedJob = openReqs.find((r) => r.id === jobId) ?? null;
  const clientId =
    mode === "job_spec"
      ? (selectedJob?.client_id ?? null)
      : (selectedJob?.client_id ?? (manualClientId === NONE ? null : manualClientId));
  const requisitionId = jobId === NONE ? null : jobId;

  const { data: contacts = [] } = useQuery({
    queryKey: ["client-contacts-composer", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("id, name, email, is_primary")
        .eq("client_id", clientId!)
        .order("is_primary", { ascending: false });
      return (data ?? []) as Contact[];
    },
    staleTime: 30_000,
    retry: 1,
    enabled: open && mode === "client" && !!clientId,
  });

  const { data: cvs } = useQuery({
    queryKey: ["candidate-cv", candidateId],
    queryFn: async () => {
      const { data } = await supabase
        .from("candidates")
        .select("cv_url, cv_url_jp_rireki, cv_url_jp_shokumu")
        .eq("id", candidateId)
        .single();
      return data as { cv_url: string | null; cv_url_jp_rireki: string | null; cv_url_jp_shokumu: string | null } | null;
    },
    staleTime: 30_000,
    retry: 1,
    enabled: open && mode === "client",
  });

  const { data: processId } = useQuery({
    queryKey: ["process-for", candidateId, requisitionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("processes")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("requisition_id", requisitionId!)
        .limit(1);
      return (data?.[0]?.id as string | undefined) ?? null;
    },
    staleTime: 30_000,
    retry: 1,
    enabled: open && mode === "client" && !!requisitionId,
  });

  const cvOptions = [
    { field: "cv_url", label: "CV (English)", path: cvs?.cv_url },
    { field: "cv_url_jp_shokumu", label: "職務経歴書", path: cvs?.cv_url_jp_shokumu },
    { field: "cv_url_jp_rireki", label: "履歴書", path: cvs?.cv_url_jp_rireki },
  ].filter((o) => !!o.path) as { field: string; label: string; path: string }[];

  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;

  function switchMode(m: Mode) {
    setMode(m);
    setSubject("");
    setBody("");
    setAttachJd(false);
    setAttachCv(false);
    setTemplateId(NONE);
    setSavingTpl(false);
    setTo(m === "client" ? "" : candidateEmail);
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (id === NONE) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    if (tpl.subject) setSubject(tpl.subject);
    setBody(tpl.body);
  }

  async function saveAsTemplate() {
    if (!tplName.trim()) {
      toast.error("Name the template first.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write the body before saving a template.");
      return;
    }
    try {
      await createTemplate.mutateAsync({
        name: tplName.trim(),
        category: modeCategory,
        subject: subject.trim() || null,
        body,
        visibility: tplVisibility,
      });
      toast.success("Template saved.");
      setSavingTpl(false);
      setTplName("");
    } catch {
      toast.error("Could not save the template.");
    }
  }

  function pickJob(v: string) {
    setJobId(v);
    setAttachJd(false);
    if (mode === "client") setContactId(NONE);
  }

  async function draft(kind: "job_spec" | "cv_intro" | "feedback" | "follow_up") {
    setDrafting(true);
    try {
      let url = "";
      let payload: Record<string, unknown> = {};
      if (kind === "job_spec") {
        if (!requisitionId) return;
        url = "/api/ai?type=spec-email";
        payload = { candidate_id: candidateId, requisition_id: requisitionId };
      } else if (kind === "cv_intro") {
        if (!requisitionId) return;
        url = "/api/ai?type=batch-cv-send";
        payload = { candidate_ids: [candidateId], requisition_id: requisitionId };
      } else {
        if (!clientId) return;
        url = "/api/ai?type=client-draft";
        payload = {
          draftType: kind === "feedback" ? "report" : "follow_up",
          clientId,
          processId: processId ?? undefined,
          recruiterId: user?.id,
        };
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await resp.json()) as {
        subject?: string;
        email?: string;
        body?: string;
        content?: string;
        error?: string;
      };
      if (json.error) {
        toast.error("Could not draft that. Try again.");
        return;
      }
      if (kind === "job_spec") {
        if (json.subject) setSubject(json.subject);
        setBody(json.email ?? "");
      } else if (kind === "cv_intro") {
        if (json.subject) setSubject(json.subject);
        setBody(json.body ?? "");
      } else {
        const content = json.content ?? "";
        const m = content.match(/^\s*subject:\s*(.+)\n+([\s\S]*)$/i);
        if (m) {
          setSubject(m[1].trim());
          setBody(m[2].trim());
        } else {
          setBody(content);
        }
      }
    } catch {
      toast.error("Could not draft that. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!to.trim() || !subject.trim()) {
      toast.error("To and Subject are required.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write the email body first.");
      return;
    }
    if (!user?.id) {
      toast.error("Not signed in.");
      return;
    }
    if (mode === "job_spec" && !requisitionId) {
      toast.error("Pick a job first.");
      return;
    }
    if (mode === "client" && !contactId) {
      toast.error("Pick a client contact first.");
      return;
    }

    const attachments: { path: string; filename: string }[] = [];
    if (mode === "job_spec" && attachJd && selectedJob?.jd_url) {
      attachments.push({ path: selectedJob.jd_url, filename: cleanFilename(selectedJob.jd_url, "JD.pdf") });
    }
    if (mode === "client" && attachCv && cvField) {
      const opt = cvOptions.find((o) => o.field === cvField);
      if (opt) attachments.push({ path: opt.path, filename: cleanFilename(opt.path, "CV.pdf") });
    }

    const payload: Record<string, unknown> = {
      recruiter_id: user.id,
      to: to.trim(),
      subject: subject.trim(),
      body,
      candidate_id: candidateId,
      direction: "outbound",
      attachments: attachments.length ? attachments : undefined,
    };
    if (mode === "plain") {
      payload.interaction_type = "email";
      payload.primary_party = "candidate";
    } else if (mode === "job_spec") {
      payload.interaction_type = "email job spec sent";
      payload.primary_party = "candidate";
      payload.client_id = clientId;
      payload.requisition_id = requisitionId;
    } else {
      payload.interaction_type = "email";
      payload.primary_party = "client";
      payload.client_id = clientId;
      payload.contact_id = contactId;
      if (requisitionId) payload.requisition_id = requisitionId;
    }

    setSending(true);
    try {
      const resp = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (json.error) {
        if (json.error.includes("No email provider")) {
          toast.error("Connect Outlook in Settings before sending.");
        } else if (/reconnect|no longer valid|connection/i.test(json.error)) {
          toast.error(json.error);
        } else {
          toast.error("Could not send email. Try again.");
        }
        return;
      }
      toast.success("Email sent.");
      onSent?.();
      onClose();
    } catch {
      toast.error("Could not send email. Try again.");
    } finally {
      setSending(false);
    }
  }

  const reqsByClient = openReqs.reduce<Record<string, OpenReq[]>>((acc, r) => {
    const key = r.clients?.company_name ?? "Other";
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 620 }}>
        <DialogHeader>
          <DialogTitle className="font-display text-base">
            Email {candidateName ? `— ${candidateName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex" style={{ border: "1px solid var(--color-ink-15)" }}>
          {([
            ["plain", "Email"],
            ["job_spec", "Email Job Spec"],
            ["client", "Email Client"],
          ] as [Mode, string][]).map(([m, label], i) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 py-1.5 text-[12px]"
              style={{
                background: mode === m ? "var(--color-ink)" : "var(--color-surface)",
                color: mode === m ? "var(--color-white)" : "var(--color-ink-60)",
                borderLeft: i === 0 ? "none" : "1px solid var(--color-ink-15)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 py-1">
          {/* Job Spec: job picker + JD attach + sparkle */}
          {mode === "job_spec" && (
            <div className="space-y-2">
              <Label className="label block">Job</Label>
              <Select value={jobId} onValueChange={pickJob}>
                <SelectTrigger className="h-8 text-[13px]">
                  <SelectValue placeholder="Pick the job to pitch…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(reqsByClient).map(([company, rs]) => (
                    <SelectGroup key={company}>
                      <SelectLabel className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>{company}</SelectLabel>
                      {rs.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="text-[13px]">{r.title}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selectedJob && (
                <div className="flex items-center justify-between">
                  {selectedJob.jd_url ? (
                    <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                      <input type="checkbox" checked={attachJd} onChange={(e) => setAttachJd(e.target.checked)} />
                      <IconPaperclip size={12} /> Attach JD file
                    </label>
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>No JD file uploaded for this job</span>
                  )}
                  <button
                    className="btn btn-ghost btn-sm flex items-center gap-1"
                    disabled={drafting}
                    onClick={() => void draft("job_spec")}
                  >
                    <IconSparkles size={12} /> {drafting ? "Drafting…" : "AI draft"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Client: job or client picker + contact + CV attach + sparkle */}
          {mode === "client" && (
            <div className="space-y-2">
              <Label className="label block">Job (optional)</Label>
              <Select value={jobId} onValueChange={pickJob}>
                <SelectTrigger className="h-8 text-[13px]">
                  <SelectValue placeholder="Link to a job…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-[13px]">No linked job</SelectItem>
                  {Object.entries(reqsByClient).map(([company, rs]) => (
                    <SelectGroup key={company}>
                      <SelectLabel className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>{company}</SelectLabel>
                      {rs.map((r) => (
                        <SelectItem key={r.id} value={r.id} className="text-[13px]">{r.title}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>

              {jobId === NONE && (
                <>
                  <Label className="label block">Client</Label>
                  <Select value={manualClientId} onValueChange={(v) => { setManualClientId(v); setContactId(NONE); }}>
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue placeholder="Pick a client…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE} className="text-[13px]">Select…</SelectItem>
                      {clientsList.map((cl) => (
                        <SelectItem key={cl.id} value={cl.id} className="text-[13px]">{cl.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              {clientId && (
                <>
                  <Label className="label block">Contact</Label>
                  <Select
                    value={contactId}
                    onValueChange={(v) => {
                      setContactId(v);
                      const c = contacts.find((x) => x.id === v);
                      if (c?.email) setTo(c.email);
                    }}
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue placeholder="Who at the client…" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-[13px]">
                          {c.name}{c.email ? "" : " (no email)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              {selectedContact && !selectedContact.email && (
                <p className="text-[11px]" style={{ color: "var(--color-danger)" }}>
                  This contact has no email on file. Add one on the client page or type it above.
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                {cvOptions.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-ink-60)" }}>
                      <input
                        type="checkbox"
                        checked={attachCv}
                        onChange={(e) => {
                          setAttachCv(e.target.checked);
                          if (e.target.checked && !cvField) setCvField(cvOptions[0].field);
                        }}
                      />
                      <IconPaperclip size={12} /> Attach CV
                    </label>
                    {attachCv && (
                      <Select value={cvField} onValueChange={setCvField}>
                        <SelectTrigger className="h-7 text-[12px]" style={{ width: 150 }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {cvOptions.map((o) => (
                            <SelectItem key={o.field} value={o.field} className="text-[12px]">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>No CV on file for this candidate</span>
                )}
              </div>

              {clientId && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] font-mono uppercase tracking-wide" style={{ color: "var(--color-ink-30)" }}>AI draft:</span>
                  <button className="btn btn-ghost btn-sm" disabled={drafting || !requisitionId} onClick={() => void draft("cv_intro")}>
                    <IconSparkles size={11} /> CV intro
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={drafting} onClick={() => void draft("feedback")}>
                    <IconSparkles size={11} /> Feedback
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={drafting} onClick={() => void draft("follow_up")}>
                    <IconSparkles size={11} /> Follow-up
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Templates */}
          <div className="flex items-center gap-2">
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger className="h-8 text-[13px] flex-1">
                <SelectValue placeholder={templateChoices.length ? "Use a template…" : "No templates yet"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-[13px]">No template</SelectItem>
                {templateChoices.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id} className="text-[13px]">
                    {tpl.name}{tpl.visibility === "private" ? " (private)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className="btn btn-ghost btn-sm flex items-center gap-1 shrink-0"
              onClick={() => setSavingTpl((v) => !v)}
              disabled={!body.trim()}
            >
              <IconDeviceFloppy size={12} /> Save as template
            </button>
          </div>
          {savingTpl && (
            <div className="flex items-center gap-2 pl-1">
              <Input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Template name"
                className="text-[13px] h-8 flex-1"
              />
              <Select value={tplVisibility} onValueChange={(v) => setTplVisibility(v as "team" | "private")}>
                <SelectTrigger className="h-8 text-[12px]" style={{ width: 110 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team" className="text-[12px]">Team</SelectItem>
                  <SelectItem value="private" className="text-[12px]">Private</SelectItem>
                </SelectContent>
              </Select>
              <button
                className="btn btn-primary btn-sm shrink-0"
                onClick={() => void saveAsTemplate()}
                disabled={createTemplate.isPending}
              >
                {createTemplate.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          <div>
            <Label className="label block mb-1">To</Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" className="text-[13px]" />
          </div>
          <div>
            <Label className="label block mb-1">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-[13px]" />
          </div>
          <div>
            <Label className="label block mb-1">Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="text-[12px] font-sans resize-none"
              placeholder="Write your email here, or use an AI draft above…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending} className="btn btn-ghost btn-sm">
            Cancel
          </Button>
          <button className="btn btn-primary btn-sm flex items-center gap-1.5" onClick={() => void handleSend()} disabled={sending}>
            <IconSend size={13} />
            {sending ? "Sending…" : "Send"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
