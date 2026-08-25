// Weekly recruiter review (Wave 6, piece 3). "What moved, what stalled, what
// you said you would do and did not, conversion against your own baseline
// rather than an industry average" -- every number here is computed in code
// from already-captured columns (processes.buy_in_confirmed_at/cv_sent_at/
// offer_date/placed_date, priority_action_state, interactions), never by the
// model -- same discipline as the Wave 4 client scorecard keeping arithmetic
// out of the prompt. Claude only writes the narrative over pre-computed facts,
// the same shape as client-snapshot.ts. Never an external/industry benchmark
// -- only the recruiter's own trailing history, gated on a minimum weeks-of-
// history threshold the same way the Wave 4 scorecard gates on n>=3 outcomes.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAY_MS = 24 * 60 * 60 * 1000;
const BASELINE_WEEKS = 4;
const MIN_WEEKS_OF_HISTORY = 3;

function daysAgo(d: Date, days: number): string {
  return new Date(d.getTime() - days * DAY_MS).toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recruiter_id, period_start } = req.body as { recruiter_id: string; period_start?: string };
  if (!recruiter_id) return res.status(400).json({ error: "recruiter_id is required" });

  const now = new Date();
  const periodStart = period_start ? new Date(period_start) : new Date(now.getTime() - 7 * DAY_MS);
  const periodStartIso = periodStart.toISOString();

  const [
    { data: movedProcesses },
    { data: activeProcesses },
    { count: interactionsThisWeekCount },
    { data: earliestInteraction },
    { data: promisesThisWeek },
    { data: baselineInteractions },
  ] = await Promise.all([
    supabase
      .from("processes")
      .select("stage, buy_in_confirmed_at, cv_sent_at, offer_date, placed_date, candidates ( full_name ), requisitions ( title, clients ( company_name ) )")
      .eq("owner_recruiter_id", recruiter_id)
      .or(
        `buy_in_confirmed_at.gte.${periodStartIso},cv_sent_at.gte.${periodStartIso},offer_date.gte.${periodStartIso},placed_date.gte.${periodStartIso}`,
      ),
    supabase
      .from("processes")
      .select("last_activity_at, candidates ( full_name ), requisitions ( title, clients ( company_name ) )")
      .eq("owner_recruiter_id", recruiter_id)
      .not("stage", "in", "(Placed,Closed lost)"),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("recruiter_id", recruiter_id)
      .gte("interacted_at", periodStartIso),
    supabase
      .from("interactions")
      .select("interacted_at")
      .eq("recruiter_id", recruiter_id)
      .order("interacted_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("priority_action_state")
      .select("status, effective_date, created_at")
      .eq("recruiter_id", recruiter_id)
      .lt("created_at", periodStartIso)
      .gte("created_at", daysAgo(periodStart, 7)),
    supabase
      .from("interactions")
      .select("interacted_at")
      .eq("recruiter_id", recruiter_id)
      .gte("interacted_at", daysAgo(periodStart, BASELINE_WEEKS * 7))
      .lt("interacted_at", periodStartIso),
  ]);

  // Stalled: active process with no touch in 30+ days (matches the existing
  // dashboard "stale, in an active process" threshold, CLAUDE.md Section 9 rule 5).
  const stalled = (activeProcesses ?? []).filter((p) => {
    if (!p.last_activity_at) return true;
    return (now.getTime() - new Date(p.last_activity_at).getTime()) / DAY_MS > 30;
  });

  const kept = (promisesThisWeek ?? []).filter((p) => p.status === "done").length;
  const broken = (promisesThisWeek ?? []).filter((p) => p.status === "snoozed" && p.effective_date < now.toISOString().slice(0, 10)).length;

  const weeksOfHistory = earliestInteraction?.interacted_at
    ? (now.getTime() - new Date(earliestInteraction.interacted_at).getTime()) / (DAY_MS * 7)
    : 0;
  const hasBaseline = weeksOfHistory >= MIN_WEEKS_OF_HISTORY;
  const thisWeekInteractionCount = interactionsThisWeekCount ?? 0;
  const baselineAvg = hasBaseline
    ? Math.round(((baselineInteractions ?? []).length / BASELINE_WEEKS) * 10) / 10
    : null;

  type MovedRow = {
    stage: string;
    candidates: { full_name: string } | null;
    requisitions: { title: string; clients: { company_name: string } | null } | null;
  };
  const movedText = ((movedProcesses ?? []) as unknown as MovedRow[])
    .map((p) => `${p.candidates?.full_name ?? "Unknown"} — ${p.requisitions?.clients?.company_name ?? "Unknown"} (${p.requisitions?.title ?? "—"}), now ${p.stage}`)
    .join("\n");

  type StalledRow = {
    candidates: { full_name: string } | null;
    requisitions: { title: string; clients: { company_name: string } | null } | null;
  };
  const stalledText = (stalled as unknown as StalledRow[])
    .map((p) => `${p.candidates?.full_name ?? "Unknown"} — ${p.requisitions?.clients?.company_name ?? "Unknown"} (${p.requisitions?.title ?? "—"})`)
    .join("\n");

  const facts = `
Review period: last 7 days (${periodStart.toDateString()} to ${now.toDateString()})

MOVED (${(movedProcesses ?? []).length}):
${movedText || "Nothing moved this week."}

STALLED (${stalled.length}) — active processes untouched 30+ days:
${stalledText || "Nothing stalled."}

FOLLOW-THROUGH: ${kept} item(s) marked done this week, ${broken} item(s) you snoozed and never came back to.

ACTIVITY VOLUME: ${thisWeekInteractionCount} interactions logged this week.${
    hasBaseline
      ? ` Your own trailing ${BASELINE_WEEKS}-week average is ${baselineAvg} per week.`
      : " Not enough history yet to compare against your own baseline (fewer than 3 weeks of recorded activity)."
  }
`.trim();

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      thinking: { type: "disabled" },
      system: `Write a weekly review for a recruiter, using only the facts given -- never invent a number, never compare to an industry benchmark, only to the recruiter's own history when given. Four short sections with **bold** headers: **What moved**, **What stalled**, **Follow-through**, **This week vs. your own pace**. Two to three sentences each, direct and specific, naming actual candidates/clients from the facts. If a section's underlying data is empty, say so in one line rather than padding it.

Plain English. Never use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`,
      messages: [{ role: "user", content: facts }],
    });

    const content = message.content.find((b) => b.type === "text")?.text.trim() ?? "";
    if (!content) return res.status(200).json({ error: "Could not generate weekly review. Try again." });

    return res.status(200).json({ content });
  } catch (err) {
    console.error("[weekly-review]", err instanceof Error ? err.message : err);
    return res.status(200).json({ error: "Could not generate weekly review. Try again." });
  }
}
