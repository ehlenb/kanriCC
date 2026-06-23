/**
 * ActivityTimeline — unified chronological activity feed.
 *
 * Replaces CandidateTimelineTab (rendering half) and ClientTimelineTab.
 * Accepts a generic TimelineInteraction array so both candidate and client
 * pages can use it without type gymnastics.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  IconPhone,
  IconMail,
  IconCalendar,
  IconFileText,
  IconMessage,
  IconClipboard,
  IconX,
} from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { interactionTypeLabel } from "@/components/shared/LogActivityModal";

// ─── exported types ───────────────────────────────────────────────────────────

export type TimelineInteraction = {
  id: string;
  recruiter_id?: string | null;
  interaction_type: string;
  summary: string | null;
  full_notes: string | null;
  interacted_at: string;
  // upcoming-event fields (candidate side)
  scheduled_at?: string | null;
  is_future?: boolean;
  // cross-link IDs
  client_id?: string | null;
  candidate_id?: string | null;
  contact_id?: string | null;
  primary_party?: string | null;
  // joined display data
  clients?: { id: string; company_name: string } | null;
  candidates?: { id: string; full_name: string } | null;
  client_contacts?: { id: string; name: string } | null;
};

/** Lightweight process-stage milestone entry for candidate timelines. */
export type TimelineMilestone = {
  id: string;
  stage: string;
  updatedAt: string;
  clientName?: string | null;
  requisitionTitle?: string | null;
};

// ─── icon + colour maps (all 9 DB-allowed types) ─────────────────────────────

const CCM_COLOR = { bg: "var(--color-indigo-light)", fg: "var(--color-indigo)" };

const ICON: Record<string, React.ElementType> = {
  call:                  IconPhone,
  email:                 IconMail,
  "email received":      IconMail,
  note:                  IconClipboard,
  meeting:               IconCalendar,
  "interview scheduled": IconCalendar,
  "job spec sent":       IconFileText,
  "linkedin message":    IconMessage,
  "cv sent":             IconFileText,
  other:                 IconClipboard,
};

const COLOR: Record<string, { bg: string; fg: string }> = {
  call:                  { bg: "var(--color-indigo-light)", fg: "var(--color-indigo)" },
  email:                 { bg: "var(--color-ink-10)",       fg: "var(--color-ink-60)" },
  "email received":      { bg: "var(--color-ink-10)",       fg: "var(--color-ink-60)" },
  note:                  { bg: "var(--color-ink-10)",       fg: "var(--color-ink-60)" },
  meeting:               { bg: "var(--color-moss-light)",   fg: "#3b6d11" },
  "interview scheduled": { bg: "var(--color-indigo-light)", fg: "var(--color-indigo)" },
  "job spec sent":       { bg: "#fef3e2",                   fg: "#974c00" },
  "linkedin message":    { bg: "var(--color-indigo-light)", fg: "var(--color-indigo)" },
  "cv sent":             { bg: "var(--color-moss-light)",   fg: "#3b6d11" },
  other:                 { bg: "var(--color-ink-10)",       fg: "var(--color-ink-30)" },
};

function iconFor(type: string): React.ElementType {
  if (/^ccm\d+$/i.test(type)) return IconCalendar;
  return ICON[type] ?? IconPhone;
}

function colorFor(type: string): { bg: string; fg: string } {
  if (/^ccm\d+$/i.test(type)) return CCM_COLOR;
  return COLOR[type] ?? CCM_COLOR;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// ─── sub-components ───────────────────────────────────────────────────────────

function Chip({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] px-[6px] py-[2px]"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

function UpcomingEntry({ item }: { item: TimelineInteraction }) {
  const type = item.interaction_type;
  const Icon = iconFor(type);
  const notes = item.full_notes || item.summary;

  return (
    <div
      className="p-[14px_18px]"
      style={{
        background: "var(--color-white)",
        border: "0.5px solid var(--color-indigo-light)",
        borderLeft: "3px solid var(--color-indigo)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center mt-0.5"
          style={{ background: "var(--color-indigo-light)" }}
        >
          <Icon size={14} style={{ color: "var(--color-indigo)" }} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Type as primary header */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[13px] font-semibold">{interactionTypeLabel(type, item.primary_party)}</span>
            <Chip bg="var(--color-indigo-light)" fg="var(--color-indigo)">Upcoming</Chip>
            <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
              {item.scheduled_at ? fmtDateTime(item.scheduled_at) : "Date TBD"}
            </span>
          </div>
          {notes && (
            <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink-60)" }}>
              {notes}
            </p>
          )}
          {item.clients && (
            <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-30)" }}>
              Re: {item.clients.company_name}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InteractionEntry({
  item,
  perspective,
  currentUserId,
  onDeleted,
}: {
  item: TimelineInteraction;
  perspective: "candidate" | "client";
  currentUserId?: string;
  onDeleted?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const type = item.interaction_type;
  const Icon = iconFor(type);
  const col = colorFor(type);
  const rawNotes = item.full_notes || item.summary;
  const [displayNotes, setDisplayNotes] = React.useState<string | null>(rawNotes);
  const [translatedFor, setTranslatedFor] = React.useState<string | null>(null);
  const [translating, setTranslating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const canDelete = !!currentUserId && item.recruiter_id === currentUserId;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("interactions").delete().eq("id", item.id);
    setDeleting(false);
    if (error) { toast.error("Could not delete activity."); return; }
    onDeleted?.(item.id);
  }

  // Auto-translate notes when language is Japanese
  React.useEffect(() => {
    if (i18n.language === "ja" && rawNotes && translatedFor !== "ja" && !translating) {
      setTranslating(true);
      void fetch("/api/ai?type=translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawNotes, target_lang: "ja" }),
      })
        .then((r) => r.json())
        .then((d: { translated?: string }) => {
          if (d.translated) { setDisplayNotes(d.translated); setTranslatedFor("ja"); }
        })
        .catch(() => { /* silent — show original */ })
        .finally(() => setTranslating(false));
    }
    if (i18n.language === "en" && translatedFor === "ja") {
      setDisplayNotes(rawNotes);
      setTranslatedFor(null);
    }
  }, [i18n.language]);

  // Build a clear "with / re:" context line
  const contactName = item.client_contacts?.name;
  const candidateName = item.candidates?.full_name;
  const clientName = item.clients?.company_name;

  function contactSan(name: string) {
    return name.split(" ")[1] ? `${name.split(" ")[1]}-san` : name;
  }

  return (
    <div
      className="relative p-[14px_18px]"
      style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
    >
      {canDelete && (
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="absolute top-2 right-2 p-1"
          style={{ color: "var(--color-ink-30)" }}
          title="Delete"
        >
          <IconX size={12} />
        </button>
      )}
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center mt-0.5"
          style={{ background: col.bg }}
        >
          <Icon size={14} style={{ color: col.fg }} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Row 1: type (bold) + date */}
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[13px] font-semibold">{interactionTypeLabel(type, item.primary_party)}</span>
            <span className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
              {fmtDate(item.interacted_at)}
            </span>
          </div>

          {/* Row 2: context chips — who/re: */}
          {(contactName || candidateName || clientName ||
            (perspective === "candidate" && item.primary_party === "client") ||
            (perspective === "client" && item.primary_party === "candidate")) && (
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {perspective === "client" && candidateName && (
                <Chip bg="var(--color-moss-light)" fg="var(--color-moss)">
                  {t("activity.timeline.candidateChip", { name: contactSan(candidateName) })}
                </Chip>
              )}
              {perspective === "candidate" && clientName && (
                <Chip bg="var(--color-indigo-light)" fg="var(--color-indigo)">
                  {clientName}
                </Chip>
              )}
              {contactName && (
                <Chip bg="var(--color-ink-10)" fg="var(--color-ink-60)">
                  {t("activity.timeline.withContact", { name: contactSan(contactName) })}
                </Chip>
              )}
              {perspective === "candidate" && item.primary_party === "client" && clientName && (
                <Chip bg="var(--color-gold-light)" fg="var(--color-gold)">{t("activity.timeline.clientSideCall")}</Chip>
              )}
              {perspective === "client" && item.primary_party === "candidate" && candidateName && (
                <Chip bg="var(--color-moss-light)" fg="var(--color-moss)">{t("activity.timeline.candidateSideCall")}</Chip>
              )}
            </div>
          )}

          {/* Notes — detect Outlook link prefix */}
          {(() => {
            const OUTLOOK_PREFIX = "View in Outlook: ";
            let outlookUrl: string | null = null;
            let notes = displayNotes;
            if (notes?.startsWith(OUTLOOK_PREFIX)) {
              const firstLineEnd = notes.indexOf("\n");
              outlookUrl = firstLineEnd > -1
                ? notes.slice(OUTLOOK_PREFIX.length, firstLineEnd).trim()
                : notes.slice(OUTLOOK_PREFIX.length).trim();
              notes = firstLineEnd > -1 ? notes.slice(firstLineEnd + 1).trim() || null : null;
            }
            return (
              <>
                {outlookUrl && (
                  <a
                    href={outlookUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] inline-flex items-center gap-1 mb-1.5 underline underline-offset-2"
                    style={{ color: "var(--color-indigo)" }}
                  >
                    <IconMail size={11} /> View in Outlook
                  </a>
                )}
                {notes ? (
                  <p className="text-[12px] leading-relaxed" style={{ color: translating ? "var(--color-ink-30)" : "var(--color-ink-60)" }}>
                    {notes}
                  </p>
                ) : !outlookUrl ? (
                  <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>{t("activity.timeline.noNotes")}</p>
                ) : null}
              </>
            );
          })()}

        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ActivityTimeline({
  interactions,
  filterContactId,
  perspective,
  currentUserId,
  onDeleted,
  emptyMessage = "No activity recorded yet.",
  emptySubMessage,
}: {
  interactions: TimelineInteraction[];
  filterContactId?: string;
  perspective: "candidate" | "client";
  currentUserId?: string;
  onDeleted?: (id: string) => void;
  emptyMessage?: string;
  emptySubMessage?: string;
}) {
  const filtered = filterContactId
    ? interactions.filter((i) => i.contact_id === filterContactId)
    : interactions;

  const upcoming = filtered
    .filter((i) => i.is_future)
    .sort((a, b) =>
      new Date(a.scheduled_at ?? a.interacted_at).getTime() -
      new Date(b.scheduled_at ?? b.interacted_at).getTime()
    );

  const feed = filtered
    .filter((i) => !i.is_future)
    .sort((a, b) => new Date(b.interacted_at).getTime() - new Date(a.interacted_at).getTime());

  if (feed.length === 0 && upcoming.length === 0) {
    return (
      <div
        className="px-5 py-12 text-center"
        style={{ background: "var(--color-white)", border: "0.5px solid var(--color-ink-15)" }}
      >
        <p className="text-[13px] font-medium" style={{ color: "var(--color-ink)" }}>
          {emptyMessage}
        </p>
        {emptySubMessage && (
          <p className="text-[12px] mt-1" style={{ color: "var(--color-ink-30)" }}>
            {emptySubMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {upcoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="label" style={{ color: "var(--color-indigo)" }}>UPCOMING</p>
          {upcoming.map((i) => <UpcomingEntry key={`up-${i.id}`} item={i} />)}
        </div>
      )}

      <div className="space-y-2">
        {feed.map((item) => (
          <InteractionEntry
            key={`i-${item.id}`}
            item={item}
            perspective={perspective}
            currentUserId={currentUserId}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}
