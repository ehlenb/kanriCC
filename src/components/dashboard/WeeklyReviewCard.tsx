import { useState } from "react";
import { IconCalendarStats, IconSparkles } from "@tabler/icons-react";

// Weekly recruiter review (Wave 6, piece 3). Generated on demand, not on
// every dashboard load -- a period rollup doesn't need to burn tokens each
// time the recruiter opens the page, unlike the ranked priority queue above.
// Same dashboard secondary-surface placement as CandidateReengagementCard /
// JobChangeSignalCard (CLAUDE.md Section 5: separate from the personal queue).

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    if (!line.trim()) return <div key={i} className="h-2" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="text-[13px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <span key={j} className="font-medium" style={{ color: "var(--color-ink)" }}>
              {part.slice(2, -2)}
            </span>
          ) : (
            part
          ),
        )}
      </p>
    );
  });
}

export function WeeklyReviewCard({ recruiterId }: { recruiterId: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai?type=weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recruiter_id: recruiterId }),
      });
      const json = (await res.json()) as { content?: string; error?: string };
      if (json.error || !json.content) {
        setError(json.error ?? "Could not generate weekly review. Try again.");
        return;
      }
      setContent(json.content);
    } catch {
      setError("Could not generate weekly review. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "0.5px solid var(--color-ink-15)" }}>
      <div
        className="flex items-center justify-between gap-2 px-4 py-2"
        style={{ background: "var(--color-ink-10)", borderBottom: "0.5px solid var(--color-ink-15)" }}
      >
        <div className="flex items-center gap-2">
          <IconCalendarStats size={14} style={{ color: "var(--color-ink-60)" }} />
          <span className="text-[12px] font-medium">Weekly review</span>
        </div>
        <button
          onClick={() => void generate()}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] font-medium"
          style={{ color: "var(--color-vermillion)" }}
        >
          <IconSparkles size={12} />
          {loading ? "Generating…" : content ? "Regenerate" : "Generate this week's review"}
        </button>
      </div>

      {error && (
        <p className="px-4 py-3 text-[13px]" style={{ color: "var(--color-vermillion)" }}>
          {error}
        </p>
      )}

      {!content && !error && !loading && (
        <div className="px-4 py-6 text-[13px] text-center" style={{ color: "var(--color-ink-30)" }}>
          What moved, what stalled, and how this week compares to your own pace.
        </div>
      )}

      {content && <div className="px-4 py-3 space-y-0.5">{renderMarkdown(content)}</div>}
    </div>
  );
}
