import { useRef, useState, useEffect } from "react";
import { IconX, IconSend2, IconSparkles } from "@tabler/icons-react";

// Ask Kanri (Wave 6, piece 1) — the single agentic surface, open from any
// authenticated page via a persistent trigger in the sidebar. Chat history
// lives in component state only, not persisted (same rule as every other AI
// output surface — CLAUDE.md Section 6). No sidebar route: adding a slide-
// over here keeps the 5-item nav invariant intact rather than claiming a 6th
// item for a feature that isn't a destination page.

type ReadRecord = { tool: string; label: string; detail?: string[] };
type ChatMessage = { role: "user" | "assistant"; content: string; read?: ReadRecord[] };

// A record with per-row detail (search_interactions returns several rows in
// one call) renders each row as its own citation line instead of one bare
// tool label -- that per-row date/type/who is what makes an answer checkable
// rather than just attributed to "search_interactions".
function citationLines(read: ReadRecord[]): string[] {
  return read.flatMap((r) => (r.detail && r.detail.length > 0 ? r.detail : [r.label]));
}

export function AskKanriDrawer({
  open,
  onClose,
  recruiterId,
}: {
  open: boolean;
  onClose: () => void;
  recruiterId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai?type=ask-kanri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recruiter_id: recruiterId,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = (await res.json()) as { answer?: string; read?: ReadRecord[]; error?: string };
      setMessages([
        ...next,
        { role: "assistant", content: json.error ?? json.answer ?? "Could not answer that. Try again.", read: json.read },
      ]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Could not answer that. Check your connection." }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(26,26,24,0.25)" }} onClick={onClose} />
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col"
        style={{ background: "var(--color-white)", borderLeft: "0.5px solid var(--color-ink-15)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "0.5px solid var(--color-ink-15)" }}
        >
          <span className="flex items-center gap-2 text-sm font-display font-medium">
            <IconSparkles size={16} style={{ color: "var(--color-vermillion)" }} />
            Ask Kanri
          </span>
          <button onClick={onClose} className="transition-colors hover:bg-black/5 p-1">
            <IconX size={16} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <p className="text-[13px] mt-4" style={{ color: "var(--color-ink-30)" }}>
              Ask about your candidates, clients, or pipeline. Answers are read-only — Ask Kanri does not change stage, log activity, or send anything.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className="inline-block px-3 py-2 text-[13px] text-left max-w-[90%]"
                style={{
                  background: m.role === "user" ? "var(--color-ink-10)" : "var(--color-white)",
                  border: m.role === "assistant" ? "0.5px solid var(--color-ink-15)" : "none",
                  color: "var(--color-ink)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
              {m.role === "assistant" && m.read && m.read.length > 0 && (
                <p className="mt-1 font-mono text-[10px] tracking-[0.04em]" style={{ color: "var(--color-ink-30)" }}>
                  Read: {citationLines(m.read).join(", ")}
                </p>
              )}
            </div>
          ))}
          {loading && (
            <p className="text-[12px]" style={{ color: "var(--color-ink-30)" }}>
              Looking that up…
            </p>
          )}
        </div>

        <div className="p-3" style={{ borderTop: "0.5px solid var(--color-ink-15)" }}>
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 text-[13px]"
            />
            <button
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="btn btn-primary btn-sm px-2.5"
              aria-label="Send"
            >
              <IconSend2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
