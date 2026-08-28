// External BD trigger detection (Wave 6, piece 5, bundled with the prospect
// object per the user's scope confirmation quoting the strategy report).
// Funding, expansion, and executive-hire signals for a prospective client,
// via Claude's native web_search tool -- the same real integration
// chat-enrich-client.ts already uses. CLAUDE.md Section 24 previously
// described this app's web research as Tavily-backed; @tavily/core is a
// listed dependency but is never actually imported anywhere in the repo, so
// that line was stale -- corrected in this wave alongside this handler.
//
// On-demand only (the recruiter clicks "Check for signals" per prospect),
// never scheduled -- no new pg_cron job, keeping this wave migration-light
// and avoiding unbounded external API cost for a low-priority BD feature
// (scored 67/100 in the strategy report, lowest in this wave).

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import { cleanAiText } from "./lib/sanitize-ai-text.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prospect_id } = req.body as { prospect_id: string };
  if (!prospect_id) return res.status(400).json({ error: "prospect_id is required" });

  const { data: prospect } = await supabase
    .from("prospects")
    .select("company_name, website")
    .eq("id", prospect_id)
    .single();
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });

  const urlHint = prospect.website?.trim() ? ` Their website is ${prospect.website.trim()}.` : "";

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: `You are a BD research assistant for a Japan-market recruitment agency deciding whether now is a good time to pitch a prospective client company. Search the web for recent signals: funding rounds, Japan market expansion, new executive hires, headcount growth announcements. Write 2-3 sentences naming the specific signal and why it matters for a recruiting pitch, or one sentence saying no recent signal was found. Be direct, no preamble. Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes.`,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as Parameters<typeof anthropic.messages.create>[0]["tools"][0]],
      messages: [{ role: "user", content: `Company: "${prospect.company_name}".${urlHint} Any recent BD-relevant signals?` }],
    });

    const answer = cleanAiText(
      message.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join(" ")
        .trim(),
    );

    if (!answer) return res.status(200).json({ error: "No signals found. Try again later." });

    await supabase.from("prospects").update({ bd_trigger_notes: answer, updated_at: new Date().toISOString() }).eq("id", prospect_id);

    return res.status(200).json({ bd_trigger_notes: answer });
  } catch (err) {
    console.error("[bd-trigger-check]", err instanceof Error ? err.message : err);
    return res.status(200).json({ error: "Signal check failed. Try again." });
  }
}
