import { useState } from "react";
import { toast } from "sonner";
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
import { IconSend } from "@tabler/icons-react";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  body: string;
  candidateId?: string;
  clientId?: string;
  onSent?: () => void;
};

export function SendEmailDialog({
  open,
  onClose,
  defaultTo = "",
  defaultSubject = "",
  body,
  candidateId,
  clientId,
  onSent,
}: Props) {
  const { user } = useAuth();
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [sending, setSending] = useState(false);

  // Sync defaults when dialog opens with new values
  const [lastBody, setLastBody] = useState(body);
  if (open && body !== lastBody) {
    setLastBody(body);
    setTo(defaultTo);
    setSubject(defaultSubject);
  }

  async function handleSend() {
    if (!to.trim() || !subject.trim()) {
      toast.error("To and Subject are required.");
      return;
    }
    if (!user?.id) {
      toast.error("Not signed in.");
      return;
    }

    setSending(true);
    try {
      const resp = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recruiter_id: user.id,
          to: to.trim(),
          subject: subject.trim(),
          body,
          candidate_id: candidateId,
          client_id: clientId,
        }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (json.error) {
        if (json.error.includes("No email provider")) {
          toast.error("Connect Gmail or Outlook in Settings before sending.");
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle className="font-display text-base">Send email</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="label block mb-1">To</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="text-[13px]"
            />
          </div>
          <div>
            <Label className="label block mb-1">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-[13px]"
            />
          </div>
          <div>
            <Label className="label block mb-1">Body</Label>
            <Textarea
              value={body}
              readOnly
              rows={10}
              className="text-[12px] font-sans resize-none"
              style={{ background: "var(--color-ink-05)", color: "var(--color-ink-60)" }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-30)" }}>
              Edit the draft before opening this dialog to adjust the body.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending} className="btn btn-ghost btn-sm">
            Cancel
          </Button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => void handleSend()}
            disabled={sending}
          >
            <IconSend size={13} />
            {sending ? "Sending…" : "Send"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
