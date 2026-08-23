// Claude occasionally writes a short reasoning preamble before a fenced JSON
// block despite "no markdown fences, no explanation" in the system prompt --
// observed while testing the Wave 2 ranking prompts (dealbreaker/weight
// language seems to nudge this). The old `raw.replace(/^```(?:json)?\s*/i, ...)`
// pattern used across several handlers only strips a fence anchored to the
// very start of the string, so any leading text defeats it. This finds the
// JSON wherever it actually is.
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw.trim();
}
