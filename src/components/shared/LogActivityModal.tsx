/**
 * LogActivityModal — unified activity logging dialog.
 *
 * Replaces LogActivityPanel (candidates.$id) and LogInteractionDialog (clients.$id).
 * Handles both candidate and client contexts. Gets recruiter_id from useAuth().
 * Caller is responsible for query invalidation via onSaved().
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import i18n from "@/i18n";
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
  "job spec sent",
  "linkedin message",
  "cv sent",
  "ccm1", "ccm2", "ccm3", "ccm4", "ccm5", "ccm6",
  "other",
] as const;

// UI display types — "candidate_call" / "client_call" / "candidate_meeting" /
// "client_meeting" are virtual values that persist as interaction_type="call"
// or "meeting" with the appropriate primary_party.
const CANDIDATE_TYPES: readonly string[] = [
  "candidate_call", "client_call", "candidate_meeting", "client_meeting",
  "email", "note",
  "ccm1", "ccm2", "ccm3", "ccm4", "ccm5", "ccm6",
  "job spec sent", "linkedin message", "other",
];
const CLIENT_TYPES: readonly string[] = [
  "client_call", "candidate_call", "client_meeting", "candidate_meeting",
  "email", "note", "other",
];

/** Human-readable label for an interaction type in a given context. */
export function interactionTypeLabel(type: string, primaryParty?: string | null): string {
  const t = (k: string) => i18n.t(k);

  if (type === "candidate_call") return t("activity.types.candidateCall");
  if (type === "client_call") return t("activity.types.clientCall");
  if (type === "candidate_meeting") return t("activity.types.candidateMeeting");
  if (type === "client_meeting") return t("activity.types.clientMeeting");
  if (type === "call") {
    if (primaryParty === "candidate") return t("activity.types.candidateCall");
    if (primaryParty === "client") return t("activity.types.clientCall");
    return t("activity.types.call");
  }
  if (type === "meeting") {
    if (primaryParty === "candidate") return t("activity.types.candidateMeeting");
    if (primaryParty === "client") return t("activity.types.clientMeeting");
    return t("activity.types.meeting");
  }
  if (/^ccm\d+$/i.test(type)) return type.toUpperCase();
  if (type === "email received") return t("activity.types.email_received");
  const key = `activity.types.${type.replace(/ /g, "_").replace(/-/g, "_")}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ");
}

/** Map a display type to the DB interaction_type. */
function toDbType(displayType: string): string {
  if (displayType === "candidate_call" || displayType === "client_call") return "call";
  if (displayType === "candidate_meeting" || displayType === "client_meeting") return "meeting";
  return displayType;
}

/** Derive primary_party from a display type. */
function toPrimaryParty(displayType: string, fallback: "candidate" | "client"): "candidate" | "client" {
  if (displayType === "candidate_call" || displayType === "candidate_meeting") return "candidate";
  if (displayType === "client_call" || displayType === "client_meeting") return "client";
  return fallback;
}

// ─── component ────────────────────────────────────────────────────────────────

/** Reverse-map a DB interaction_type + primary_party back to a display type. */
export function toDisplayType(dbType: string, primaryParty?: string | null): string {
  if (dbType === "call") return primaryParty === "client" ? "client_call" : "candidate_call";
  if (dbType === "meeting") return primaryParty === "client" ? "client_meeting" : "candidate_meeting";
  if (dbType === "interview scheduled") return "ccm1";
  return dbType;
}

export type EditableInteraction = {
  id: string;
  interaction_type: string;
  primary_party?: string | null;
  interacted_at: string;
  scheduled_at?: string | null;
  is_future?: boolean;
  full_notes?: string | null;
  summary?: string | null;
  client_id?: string | null;
  contact_id?: string | null;
};

export function LogActivityModal({
  open,
  onClose,
  onSaved,
  context,
  initialType,
  existingEntry,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  context: LogActivityContext;
  initialType?: string;
  existingEntry?: EditableInteraction;
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

  // Client-specific: optional contact selector and linked job
  const [contactId, setContactId] = useState<string | null>(
    context.type === "client" ? (context.initialContactId ?? null) : null
  );
  const [linkedReqId, setLinkedReqId] = useState<string | null>(null);

  // Reset when modal opens — pre-fill from existingEntry when editing
  useEffect(() => {
    if (open) {
      if (existingEntry) {
        const displayType = toDisplayType(existingEntry.interaction_type, existingEntry.primary_party);
        const isFuture = existingEntry.is_future ?? false;
        setTiming(isFuture ? "upcoming" : "past");
        setType(availableTypes.includes(displayType) ? displayType : existingEntry.interaction_type);
        setDate(existingEntry.interacted_at.split("T")[0]);
        if (existingEntry.scheduled_at) {
          const d = new Date(existingEntry.scheduled_at);
          setScheduledDate(d.toISOString().split("T")[0]);
          setScheduledTime(d.toTimeString().slice(0, 5));
        }
        setNotes(existingEntry.full_notes ?? existingEntry.summary ?? "");
        setCrossClientId(existingEntry.client_id ?? null);
        setContactId(existingEntry.contact_id ?? null);
        setLinkedReqId(null);
      } else {
        setTiming("past");
        setType(defaultType);
        setDate(new Date().toISOString().split("T")[0]);
        setScheduledDate(new Date().toISOString().split("T")[0]);
        setScheduledTime("10:00");
        setNotes("");
        setCrossClientId(null);
        setContactId(
          context.type === "client" ? (context.initialContactId ?? null) : null
        );
        setLinkedReqId(null);
      }
      setSaving(false);
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
    // No forced type change — recruiter picks the type (call, ccm1, meeting, etc.)
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

    const dbType = toDbType(type);
    const derivedCandidateParty = toPrimaryParty(type, "candidate");
    const derivedClientParty = toPrimaryParty(type, "client");

    if (existingEntry) {
      const patch = {
        interaction_type: dbType,
        interacted_at: interactedAt,
        scheduled_at: scheduledAt,
        is_future: isFuture,
        summary: summary.trim(),
        full_notes: notes.trim() || null,
        primary_party: context.type === "candidate"
          ? (crossClientId ? derivedCandidateParty : "candidate")
          : derivedClientParty,
        client_id: context.type === "candidate" ? (crossClientId || null) : undefined,
        contact_id: context.type === "client" ? (contactId || null) : undefined,
      };
      const { error } = await supabase.from("interactions").update(patch).eq("id", existingEntry.id);
      setSaving(false);
      if (error) { toast.error("Failed to save changes."); return; }
      toast.success("Activity updated.");
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("interactions").insert(
      context.type === "candidate"
        ? {
            candidate_id: context.id,
            recruiter_id: user.id,
            interaction_type: dbType,
            interacted_at: interactedAt,
            scheduled_at: scheduledAt,
            is_future: isFuture,
            summary: summary.trim(),
            full_notes: notes.trim() || null,
            client_id: crossClientId || null,
            primary_party: crossClientId ? derivedCandidateParty : "candidate",
          }
        : {
            client_id: context.id,
            recruiter_id: user.id,
            interaction_type: dbType,
            interacted_at: interactedAt,
            scheduled_at: scheduledAt,
            is_future: isFuture,
            summary: summary.trim(),
            full_notes: notes.trim() || null,
            contact_id: contactId || null,
            primary_party: derivedClientParty,
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

    // Auto-update client strategy notes in the background for client interactions
    // with substantive content. The endpoint judges whether the log is strategically
    // useful before updating — logistical notes ("sent calendar invite") are ignored.
    if (context.type === "client" && !isFuture) {
      const logContent = [summary.trim(), notes.trim()].filter(Boolean).join("\n\n");
      if (logContent.length > 20) {
        void fetch("/api/ai?type=update-client-strategy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: context.id,
            interaction_summary: summary.trim() || null,
            interaction_notes: notes.trim() || null,
          }),
        });
      }
    }
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
            {existingEntry ? "Edit activity" : "Log activity"}
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
                    <SelectItem key={t} value={t} className="text-[13px]">
                      {interactionTypeLabel(t)}
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

          {/* ── Candidate context: client cross-link — shown when "Client Call" is selected ── */}
          {context.type === "candidate" && (
            <div className="space-y-1.5">
              <Label className="text-[12px]">
                {type === "client_call" ? "Which client? (required for cross-link)" : "Linked client (optional)"}
              </Label>
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
                <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                  This activity will appear on both timelines.
                </p>
              )}
            </div>
          )}

          {/* ── Client context: contact selector shown for client calls ── */}
          {context.type === "client" && (
            <>
              {(type === "client_call" || type === "client_meeting") && contacts.length > 0 && (
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
            {saving ? "Saving…" : existingEntry ? "Save changes" : "Log activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export type alias for the full type list (used for validation elsewhere)
export { ALL_TYPES as ALL_ACTIVITY_TYPES };
