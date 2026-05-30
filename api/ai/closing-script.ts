import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { process_id } = req.body as { process_id: string };

  if (!process_id) return res.status(400).json({ error: "process_id is required" });

  const { data: processData } = await supabase
    .from("processes")
    .select(
      "stage, offer_amount, offer_date, last_activity_at, candidate_id, requisition_id, candidates ( full_name, ai_context, candidate_motivations ( rank, motivation_text, motivation_type ), candidate_blockers ( theme, detail, is_risk ), competing_interviews ( company_name, stage, is_active ) ), requisitions ( title, salary_min, salary_max, clients ( company_name, ai_context, employee_japanese_pct, years_in_japan ) )",
    )
    .eq("id", process_id)
    .single();

  if (!processData) return res.status(404).json({ error: "Process not found" });

  const proc = processData as {
    stage: string;
    offer_amount: number | null;
    offer_date: string | null;
    last_activity_at: string | null;
    candidates: {
      full_name: string;
      ai_context: string | null;
      candidate_motivations: Array<{ rank: number; motivation_text: string; motivation_type: string | null }>;
      candidate_blockers: Array<{ theme: string; detail: string | null; is_risk: boolean }>;
      competing_interviews: Array<{ company_name: string; stage: string | null; is_active: boolean }>;
    } | null;
    requisitions: {
      title: string;
      salary_min: number | null;
      salary_max: number | null;
      clients: {
        company_name: string;
        ai_context: string | null;
        employee_japanese_pct: number | null;
        years_in_japan: number | null;
      } | null;
    } | null;
  };

  const cand = proc.candidates;
  const req_ = proc.requisitions;

  if (!cand || !req_) return res.status(404).json({ error: "Related data not found" });

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const daysSinceOffer = proc.offer_date
    ? Math.floor((Date.now() - new Date(proc.offer_date).getTime()) / 86400000)
    : null;

  const activeCompeting = cand.competing_interviews.filter((ci) => ci.is_active);
  const activeRisks = cand.candidate_blockers.filter((b) => b.is_risk);

  const prompt = `
CANDIDATE: ${cand.full_name}
${cand.ai_context ? `Intelligence summary:\n${cand.ai_context.slice(0, 500)}` : ""}

Motivations (ranked — use this order for key points):
${cand.candidate_motivations.map((m) => `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`).join("\n")}

Active risks:
${activeRisks.length > 0 ? activeRisks.map((b) => `- ${b.theme}: ${b.detail ?? ""}`).join("\n") : "None noted."}

Active competing interviews:
${activeCompeting.length > 0 ? activeCompeting.map((ci) => `- ${ci.company_name}${ci.stage ? ` (${ci.stage})` : ""}`).join("\n") : "None disclosed."}

OFFER: ${formatYen(proc.offer_amount)}${daysSinceOffer !== null ? ` — made ${daysSinceOffer} days ago` : ""}
Role: ${req_.title}
Salary range: ${formatYen(req_.salary_min)}–${formatYen(req_.salary_max)}

COMPANY: ${req_.clients?.company_name ?? "—"}
${req_.clients?.years_in_japan ? `Years in Japan: ${req_.clients.years_in_japan}` : ""}
${req_.clients?.employee_japanese_pct != null ? `Japanese team %: ${req_.clients.employee_japanese_pct}%` : ""}
${req_.clients?.ai_context ? `Client intelligence: ${req_.clients.ai_context.slice(0, 400)}` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1000,
    system: `You are writing a closing call guide for a recruiter in Japan. The candidate is at Offer stage. The recruiter reads this immediately before the closing call.

Write in plain text. Use ALL CAPS section labels exactly as shown below. No markdown.

SITUATION
[Current state: offer amount, days since offer, any known competing situation. 2-3 sentences.]

CANDIDATE LIKELY STATE
[Based on motivations and blockers — what they are probably thinking right now. 2-3 sentences.]

KEY POINTS TO LAND (in this order)
[3 points sequenced by motivation rank. Bold lead phrase. 2 sentences each. Address the specific company as a match for their ranked motivations.]

COUNTEROFFER DEFENSE
[Only include if a blocker, active risk, or competing interview suggests this is relevant. Include these statistics naturally — not as recited facts: 60-80% of employees who accept a counteroffer leave within 6 months. 90% leave within 12 months. Omit this section entirely if there is no counteroffer risk.]

SUGGESTED CLOSE
[One question or statement to move them to yes. Not a script — a direction. 1-2 sentences.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Clear English for recruiters who may share notes with non-native speakers.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0]?.type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
