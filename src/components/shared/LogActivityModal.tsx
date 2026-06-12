/**
 * LogActivityModal — unified activity logging dialog.
 *
 * Replaces LogActivityPanel (candidates.$id) and LogInteractionDialog (clients.$id).
 * Handles both candidate and client contexts. Gets recruiter_id from useAuth().
 * Caller is responsible for query invalidation via onSaved().
 */

import { useState, useEffect } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── types ────────────────────────────────────────────────────────────────────

export type LogActivityContext =
  | {
      type: "candidate";
      id: string;
      name?: string;
    }
  | {
      type: "client";
      id: string;
      name?: string;
      contacts?: { id: string; name: string }[];
      initialContactId?: string | null;
      openReqs?: { id: string; title: string }[];
    };

const ALL_TYPES = [
  "call",
  "email",
  "note",
  "meeting",
  "interview scheduled",
  "job spec sent",
  "linkedin message",
  "cv sent",
  "other",
] as const;

// Types shown in the selector per context
const CANDIDATE_TYPES: readonly string[] = [
  "call", "email", "note", "meeting",
  "interview scheduled", "job spec sent", "linkedin message", "other",
];
const CLIENT_TYPES: readonly string[] = [
  "call", "email", "note", "meeting", "other",
];

// ─── component ────────────────────────────────────────────────────────────────

export function LogActivityModal({
  open,
  onClose,
  onSaved,
  context,
  initialType,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  context: LogActivityContext;
  initialType?: string;
}) {
  const { user } = useAuth();

  const availableTypes =
    context.type === "candidate" ? CANDIDATE_TYPES : CLIENT_TYPES;

  const defaultType =
    initialType && availableTypes.includes(initialType)
      ? initialType
      : availableTypes[0];

  // ── form state ──────────────────────────────────────────────────────────────
  const [timing, setTiming] = useState<"past" | "upcoming">("past");
  const [type, setType] = useState(defaultType);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Candidate-specific: optional client cross-link
  const [crossClientId, setCrossClientId] = useState<string | null>(null);
  const [primaryParty, setPrimaryParty] = useState<"candidate" | "client">(
    "candidate"
  );

  // Client-specific: optional contact selector and linked job
  const [contactId, setContactId] = useState<string | null>(
    context.type === "client" ? (context.initialContactId ?? null) : null
  );
  const [clientPrimaryParty, setClientPrimaryParty] = useState<
    "client" | "candidate"
  >("client");
  const [linkedReqId, setLinkedReqId] = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setTiming("past");
      setType(defaultType);
      setDate(new Date().toISOString().split("T")[0]);
      setScheduledDate(new Date().toISOString().split("T")[0]);
      setScheduledTime("10:00");
      setNotes("");
      setSaving(false);
      setCrossClientId(null);
      setPrimaryParty("candidate");
      setContactId(
        context.type === "client" ? (context.initialContactId ?? null) : null
      );
      setClientPrimaryParty("client");
      setLinkedReqId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Candidate context: load clients list for optional cross-link
  const { data: clientsList } = useQuery({
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
    enabled: open && context.type === "candidate",
  });

  function handleTimingChange(v: "past" | "upcoming") {
    setTiming(v);
    if (v === "upcoming") {
      if (!availableTypes.includes("interview scheduled")) return;
      setType("interview scheduled");
    } else if (type === "interview scheduled") {
      setType(availableTypes[0]);
    }
  }

  async function save() {
    if (!notes.trim()) {
      toast.error("Notes are required.");
      return;
    }
    // Derive a one-line summary from the first sentence/line of notes
    const summary = notes.trim().split(/[\n.]/)[0].trim().slice(0, 160);
    if (timing === "upcoming" && !scheduledDate) {
      toast.error("A scheduled date is required.");
      return;
    }
    if (!user?.id) {
      toast.error("Not logged in.");
      return;
    }

    setSaving(true);
    const isFuture = timing === "upcoming";
    const scheduledAt = isFuture
      ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
      : null;
    const interactedAt = new Date(date + "T09:00:00").toISOString();

    const { error } = await supabase.from("interactions").insert(
      context.type === "candidate"
        ? {
            candidate_id: context.id,
            recruiter_id: user.id,
            interaction_type: type,
            interacted_at: interactedAt,
            scheduled_at: scheduledAt,
            is_future: isFuture,
            summary: summary.trim(),
            full_notes: notes.trim() || null,
            client_id: crossClientId || null,
            primary_party: crossClientId ? primaryParty : "candidate",
          }
        : {
            client_id: context.id,
            recruiter_id: user.id,
            interaction_type: type,
            interacted_at: interactedAt,
            scheduled_at: scheduledAt,
            is_future: isFuture,
            summary: summary.trim(),
            full_notes: notes.trim() || null,
            contact_id: contactId || null,
            primary_party: clientPrimaryParty,
            requisition_id: linkedReqId || null,
          }
    );
    setSaving(false);

    if (error) {
      toast.error("Failed to log activity.");
      return;
    }

    toast.success(isFuture ? "Upcoming event saved." : "Activity logged.");
    onSaved();
    onClose();
  }

  const contacts =
    context.type === "client" ? (context.contacts ?? []) : [];

  // Only show Upcoming toggle for candidate context (client side doesn't yet
  // support upcoming-event rendering in the timeline)
  const showUpcomingToggle = context.type === "candidate";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[16px]">
            Log activity
            {context.name ? (
              <span
                className="ml-2 text-[13px] font-sans font-normal"
                style={{ color: "var(--color-ink-60)" }}
              >
                — {context.name}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Past / Upcoming toggle — candidate only */}
          {showUpcomingToggle && (
            <div
              className="flex gap-0"
              style={{ border: "0.5px solid var(--color-ink-15)" }}
            >
              {(["past", "upcoming"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => handleTimingChange(v)}
                  className="flex-1 py-1.5 text-[12px] font-medium capitalize transition-colors"
                  style={{
                    background:
                      timing === v ? "var(--color-ink)" : "var(--color-white)",
                    color:
                      timing === v
                        ? "var(--color-white)"
                        : "var(--color-ink-60)",
                  }}
                >
                  {v === "upcoming" ? "Upcoming" : "Past"}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-[12px]">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize text-[13px]">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            {timing === "past" ? (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 text-[13px]"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Scheduled date</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="h-8 text-[13px]"
                />
              </div>
            )}
          </div>

          {/* Scheduled time — upcoming only */}
          {timing === "upcoming" && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Scheduled time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="h-8 text-[13px] w-36"
              />
            </div>
          )}

          {/* Notes — single field */}
          <div className="space-y-1.5">
            <Label className="text-[12px]">Notes *</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened, what was agreed, what to follow up on…"
              className="min-h-[120px] text-[13px]"
              autoFocus
            />
          </div>

          {/* ── Candidate context: optional client cross-link ── */}
          {context.type === "candidate" && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">Linked client (optional)</Label>
              <Select
                value={crossClientId ?? "__none__"}
                onValueChange={(v) =>
                  setCrossClientId(v === "__none__" ? null : v)
                }
              >
                <SelectTrigger className="h-8 text-[13px]">
                  <SelectValue placeholder="Link to a client if applicable…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-[13px]">
                    No client
                  </SelectItem>
                  {(clientsList ?? []).map((cl) => (
                    <SelectItem
                      key={cl.id}
                      value={cl.id}
                      className="text-[13px]"
                    >
                      {cl.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {crossClientId && (
                <div className="space-y-1.5 mt-1">
                  <Label className="text-[12px]">Who did you speak with?</Label>
                  <div className="flex gap-2">
                    {(["candidate", "client"] as const).map((party) => (
                      <button
                        key={party}
                        onClick={() => setPrimaryParty(party)}
                        className="text-[12px] px-3 py-1.5"
                        style={{
                          background:
                            primaryParty === party
                              ? "var(--color-indigo-light)"
                              : "var(--color-ink-10)",
                          color:
                            primaryParty === party
                              ? "var(--color-indigo)"
                              : "var(--color-ink-60)",
                          border: `0.5px solid ${primaryParty === party ? "#b5d4f4" : "rgba(26,26,24,0.12)"}`,
                        }}
                      >
                        {party === "candidate" ? "Candidate" : "Client contact"}
                      </button>
                    ))}
                  </div>
                  <p
                    className="text-[11px]"
                    style={{ color: "var(--color-ink-30)" }}
                  >
                    This activity will appear on both timelines.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Client context: who you spoke with + contact selector ── */}
          {context.type === "client" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Who you spoke with</Label>
                  <Select
                    value={clientPrimaryParty}
                    onValueChange={(v) =>
                      setClientPrimaryParty(v as "client" | "candidate")
                    }
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client" className="text-[13px]">
                        Client contact
                      </SelectItem>
                      <SelectItem value="candidate" className="text-[13px]">
                        Candidate
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {clientPrimaryParty === "client" && contacts.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">Contact (optional)</Label>
                    <Select
                      value={contactId ?? "__none__"}
                      onValueChange={(v) =>
                        setContactId(v === "__none__" ? null : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-[13px]">
                        <SelectValue placeholder="Select contact…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-[13px]">
                          No specific contact
                        </SelectItem>
                        {contacts.map((ct) => (
                          <SelectItem
                            key={ct.id}
                            value={ct.id}
                            className="text-[13px]"
                          >
                            {ct.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Linked job — shown when there are open reqs */}
              {(context.openReqs ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[12px]">Linked job (optional)</Label>
                  <Select
                    value={linkedReqId ?? "__none__"}
                    onValueChange={(v) =>
                      setLinkedReqId(v === "__none__" ? null : v)
                    }
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue placeholder="Link to an open role…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-[13px]">
                        No linked job
                      </SelectItem>
                      {(context.openReqs ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id} className="text-[13px]">
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving || !notes.trim()}
          >
            {saving ? "Saving…" : "Log activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export type alias for the full type list (used for validation elsewhere)
export { ALL_TYPES as ALL_ACTIVITY_TYPES };
