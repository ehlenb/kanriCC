// Shared output scrubber for AI-generated text.
//
// CLAUDE.md forbids em dashes and requires plain, clear English in every AI
// output, and the design system forbids bold body copy. claude-sonnet-5 still
// reaches for Markdown (**bold**, `code`, ## headings) and em dashes no matter
// how firmly the prompt says not to. Rather than fight that in ~48 separate
// prompts and hope for compliance, every AI response is scrubbed here in one
// place:
//   - api/ai.ts wraps res.json so all dispatched handlers are covered
//   - the two standalone api/ai/*.ts handlers call cleanAiText directly
//   - handlers that persist model prose (ai_context, strategy_notes, ...) call
//     cleanAiText before the DB write so stored text is clean on later reads
//
// Keep this conservative: only strip markup that is noise in recruiter-facing
// prose. Do not touch single underscores (snake_case field names) or single
// asterisks (rare, and easy to mangle arithmetic / bullet lists).

export function cleanAiText(s: string): string {
  if (!s) return s;
  return s
    .replace(/\*\*/g, "") // bold **x**
    .replace(/__/g, "") // bold __x__ (single _ left alone: snake_case)
    .replace(/`/g, "") // inline `code`
    .replace(/^\s{0,3}#{1,6}[ \t]+/gm, "") // ## headings -> plain line
    .replace(/\s*—\s*/g, " - ") // em dash -> spaced hyphen
    .replace(/\s*–\s*/g, "-"); // en dash (usually a range) -> hyphen
}

// Recursively clean every string in an arbitrary JSON-serialisable value.
// Handler responses vary in shape ({ content }, { points: [...] }, a full
// result object), so the dispatcher walks the whole body rather than knowing
// each handler's schema.
export function deepCleanStrings<T>(value: T): T {
  if (typeof value === "string") return cleanAiText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepCleanStrings(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepCleanStrings(v);
    }
    return out as T;
  }
  return value;
}
