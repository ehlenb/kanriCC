// Placement post-mortem (Wave 6, piece 2). Per-event, five lines, fires after
// every terminal outcome -- Placed or Closed lost -- never a cross-placement
// report. The live data (5 placements, 6 closed-lost as of this wave) could
// not support pattern mining even if the brief asked for it, which it does
// not: "After every placement and every loss, five lines of what worked,
// written back to client and candidate memory."
//
// "Written back to memory" does NOT mean writing ai_context directly -- only
// refresh-context writes that (Memory Doctrine, CLAUDE.md Section 2). Instead
// the frontend inserts an `interactions` row with triggers_context_refresh
// once the recruiter approves the draft, and the existing pgmq/pg_cron
// pipeline folds it into both entities' ai_context on its own -- memory
// refreshing as a consequence of activity, exactly as designed.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function fmtYen(n: number | null): string {
  return n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { process_id } = req.body as { process_id: string };
  if (!process_id) return res.status(400).json({ error: "process_id is required" });

  const { data: process } = await supabase
    .from("processes")
    .select(
      "stage, closed_reason_category, closed_reason, placed_fee_jpy, start_date, ccm_outcome, candidates ( id, full_name, ai_context ), requisitions ( title, clients ( id, company_name, ai_context ) )",
    )
    .eq("id", process_id)
    .single();

  if (!process) return res.status(404).json({ error: "Process not found" });
  if (process.stage !== "Placed" && process.stage !== "Closed lost") {
    return res.status(400).json({ error: "Post-mortem only applies to a Placed or Closed lost process" });
  }

  const { data: interactions } = await supabase
    .from("interactions")
    .select("interaction_type, summary, full_notes, interacted_at, ccm_outcome")
    .eq("process_id", process_id)
    .order("interacted_at", { ascending: true });

  const candidate = process.candidates as unknown as { id: string; full_name: string; ai_context: string | null } | null;
  const client = process.requisitions?.clients as unknown as { id: string; company_name: string; ai_context: string | null } | null;

  const historyText = (interactions ?? [])
    .map((i) => {
      const verdict = i.ccm_outcome ? ` (client verdict: ${i.ccm_outcome.toUpperCase()})` : "";
      return `[${i.interacted_at?.slice(0, 10)}] ${i.interaction_type}${verdict}: ${i.full_notes?.slice(0, 300) ?? i.summary ?? "no notes"}`;
    })
    .join("\n");

  const outcomeLine =
    process.stage === "Placed"
      ? `PLACED. Fee: ${fmtYen(process.placed_fee_jpy)}. Start date: ${process.start_date ?? "not set"}.`
      : `CLOSED LOST. Category: ${process.closed_reason_category ?? "uncategorized"}. Detail: ${process.closed_reason ?? "none"}.`;

  const prompt = `
Candidate: ${candidate?.full_name ?? "Unknown"}
Client: ${client?.company_name ?? "Unknown"}
Role: ${process.requisitions?.title ?? "Unknown"}

Outcome: ${outcomeLine}

Round-by-round history (chronological):
${historyText || "No interactions logged."}

${candidate?.ai_context ? `Candidate context:\n${candidate.ai_context}` : ""}
${client?.ai_context ? `Client context:\n${client.ai_context}` : ""}
`.trim();

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      thinking: { type: "disabled" },
      system: `Write a five-line placement post-mortem for a recruiter's own record. Exactly five lines, each one sentence, each starting with a plain-text dash. Cover: what worked (or what went wrong), the specific moment or decision that mattered most, and one thing to repeat or avoid next time with this client or this type of candidate. Be specific and concrete -- name the actual thing that happened, not a generic lesson. Base every line only on the history given; never invent a detail that is not there.

Plain English. Never use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. No headers, no numbering beyond the five dashes.`,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content.find((b) => b.type === "text")?.text.trim() ?? "";
    if (!content) return res.status(200).json({ error: "Could not generate post-mortem. Try again." });

    return res.status(200).json({
      content,
      candidate_id: candidate?.id ?? null,
      client_id: client?.id ?? null,
    });
  } catch (err) {
    console.error("[placement-postmortem]", err instanceof Error ? err.message : err);
    return res.status(200).json({ error: "Could not generate post-mortem. Try again." });
  }
}
