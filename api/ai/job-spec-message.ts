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

  const { candidate_id, requisition_id, recruiter_id } = req.body as {
    candidate_id: string;
    requisition_id: string;
    recruiter_id: string;
  };

  if (!candidate_id || !requisition_id || !recruiter_id) {
    return res.status(400).json({ error: "candidate_id, requisition_id, and recruiter_id are required" });
  }

  const [{ data: candidate }, { data: requisition }] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, current_title, current_company, japanese_level, english_level, active_passive, urgency_notes, notes_pitch, notes_personality, notes_closing, current_total, expected_total_min, expected_total_max",
      )
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("requisitions")
      .select(
        "title, salary_min, salary_max, salary_range_text, strategic_context, location, clients ( company_name, strategy_notes )",
      )
      .eq("id", requisition_id)
      .single(),
  ]);

  if (!candidate) return res.status(404).json({ error: "Candidate not found" });
  if (!requisition) return res.status(404).json({ error: "Requisition not found" });

  const [{ data: motivations }] = await Promise.all([
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text")
      .eq("candidate_id", candidate_id)
      .order("rank"),
  ]);

  const client = (Array.isArray(requisition.clients) ? requisition.clients[0] : requisition.clients) as {
    company_name: string;
    strategy_notes: string | null;
  } | null;

  const formatComp = (v: number | null) =>
    v ? `¥${(v / 1_000_000).toFixed(1)}M` : null;

  const salaryLine = requisition.salary_range_text
    ? requisition.salary_range_text
    : [formatComp(requisition.salary_min), formatComp(requisition.salary_max)].filter(Boolean).join("–");

  const motivationLines = (motivations ?? [])
    .map((m, i) => `  ${i + 1}. ${m.motivation_text}`)
    .join("\n");

  const prompt = `You are a Japan-market agency recruiter writing a short, personalised outreach message to a candidate.

CANDIDATE
Name: ${candidate.full_name}${candidate.full_name_japanese ? ` (${candidate.full_name_japanese})` : ""}
Current: ${candidate.current_title ?? "—"} at ${candidate.current_company ?? "—"}
Languages: Japanese ${candidate.japanese_level ?? "?"} / English ${candidate.english_level ?? "?"}
Current total comp: ${formatComp(candidate.current_total) ?? "not recorded"}
Comp expectation: ${[formatComp(candidate.expected_total_min ?? null), formatComp(candidate.expected_total_max ?? null)].filter(Boolean).join("–") || "not recorded"}
Active/passive: ${candidate.active_passive ?? "unknown"}
${candidate.urgency_notes ? `Urgency notes: ${candidate.urgency_notes}` : ""}
${candidate.notes_pitch ? `What resonates with them: ${candidate.notes_pitch}` : ""}
${candidate.notes_personality ? `Personality: ${candidate.notes_personality}` : ""}
${candidate.notes_closing ? `How to close them: ${candidate.notes_closing}` : ""}

STATED MOTIVATIONS (ranked — use these to anchor the message)
${motivationLines || "  None recorded"}

ROLE
Title: ${requisition.title}
Company: ${client?.company_name ?? "—"}
${salaryLine ? `Salary: ${salaryLine}` : ""}
${requisition.location ? `Location: ${requisition.location}` : ""}
${requisition.strategic_context ? `Context: ${requisition.strategic_context}` : ""}
${client?.strategy_notes ? `Client notes: ${client.strategy_notes}` : ""}

Write a short, direct LinkedIn or email outreach message from the recruiter to this candidate.

Rules:
- 3 to 4 sentences maximum
- Lead with why THIS role fits THIS candidate based on their top motivations — do not open with pleasantries
- One concrete reason why this role aligns to their situation (career trajectory, comp, culture — pick the strongest)
- End with a low-friction ask: e.g. "Worth a quick 10-minute chat?"
- Sound like a trusted adviser, not a cold pitch
- Plain English — the candidate may not be a native English speaker
- Never mention salary unless it clearly beats their stated expectation
- Do not use: straightforward, genuinely, honestly, leverage, utilize. No em dashes.

Return only the message text. No subject line. No sign-off. No markdown.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
  if (!text) return res.status(200).json({ error: "No message generated. Try again." });

  return res.status(200).json({ message: text });
}
