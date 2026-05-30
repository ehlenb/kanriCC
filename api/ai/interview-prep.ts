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

  const { process_id, ccm_number } = req.body as {
    process_id: string;
    ccm_number: number;
  };

  if (!process_id || !ccm_number) {
    return res.status(400).json({ error: "process_id and ccm_number are required" });
  }

  const { data: processData } = await supabase
    .from("processes")
    .select(
      "stage, candidate_id, requisition_id, candidates ( full_name, current_title, current_company, japanese_level, english_level, ai_context, candidate_roles ( company_name, title, is_current, achievement_notes ), candidate_motivations ( rank, motivation_text ), candidate_blockers ( theme, detail, is_risk ) ), requisitions ( title, jd_text, interview_notes, strategic_context, salary_min, salary_max, clients ( company_name, ai_context, years_in_japan, strategy_notes, client_contacts ( name, title, role, is_primary ) ), requisition_conditions ( condition_text, condition_type, priority_rank ) )",
    )
    .eq("id", process_id)
    .single();

  if (!processData) return res.status(404).json({ error: "Process not found" });

  const proc = processData as {
    stage: string;
    candidates: {
      full_name: string;
      current_title: string | null;
      current_company: string | null;
      japanese_level: string | null;
      english_level: string | null;
      ai_context: string | null;
      candidate_roles: Array<{ company_name: string; title: string | null; is_current: boolean; achievement_notes: string | null }>;
      candidate_motivations: Array<{ rank: number; motivation_text: string }>;
      candidate_blockers: Array<{ theme: string; detail: string | null; is_risk: boolean }>;
    } | null;
    requisitions: {
      title: string;
      jd_text: string | null;
      interview_notes: string | null;
      strategic_context: string | null;
      salary_min: number | null;
      salary_max: number | null;
      clients: {
        company_name: string;
        ai_context: string | null;
        years_in_japan: number | null;
        strategy_notes: string | null;
        client_contacts: Array<{ name: string; title: string | null; role: string; is_primary: boolean }>;
      } | null;
      requisition_conditions: Array<{ condition_text: string; condition_type: string; priority_rank: number }>;
    } | null;
  };

  const cand = proc.candidates;
  const req_ = proc.requisitions;

  if (!cand || !req_) return res.status(404).json({ error: "Related data not found" });

  const primaryContact = req_.clients?.client_contacts?.find((cc) => cc.is_primary) ?? req_.clients?.client_contacts?.[0];
  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const prompt = `
CANDIDATE: ${cand.full_name}
Current: ${cand.current_title ?? "—"} at ${cand.current_company ?? "—"}
Languages: Japanese ${cand.japanese_level ?? "—"} / English ${cand.english_level ?? "—"}
${cand.ai_context ? `Candidate intelligence:\n${cand.ai_context.slice(0, 500)}` : ""}

Motivations:
${cand.candidate_motivations.map((m) => `${m.rank}. ${m.motivation_text}`).join("\n")}

${cand.candidate_blockers.filter((b) => b.is_risk).length > 0 ? `Active risks:\n${cand.candidate_blockers.filter((b) => b.is_risk).map((b) => `- ${b.theme}: ${b.detail ?? ""}`).join("\n")}` : ""}

ROLE: ${req_.title} at ${req_.clients?.company_name ?? "—"}
Interview round: CCM${ccm_number}
Salary range: ${formatYen(req_.salary_min)}–${formatYen(req_.salary_max)}
${req_.interview_notes ? `Interview process notes: ${req_.interview_notes.slice(0, 300)}` : ""}
${req_.strategic_context ? `Strategic context: ${req_.strategic_context.slice(0, 300)}` : ""}

Key conditions:
${req_.requisition_conditions.map((c) => `[${c.condition_type.toUpperCase()}] ${c.condition_text}`).join("\n")}

${req_.jd_text ? `JD excerpt:\n${req_.jd_text.slice(0, 800)}` : ""}

CLIENT: ${req_.clients?.company_name ?? "—"}
${req_.clients?.years_in_japan ? `Years in Japan: ${req_.clients.years_in_japan}` : ""}
${req_.clients?.strategy_notes ? `Strategy: ${req_.clients.strategy_notes.slice(0, 300)}` : ""}
${req_.clients?.ai_context ? `Client intelligence: ${req_.clients.ai_context.slice(0, 400)}` : ""}
${primaryContact ? `Interviewer: ${primaryContact.name}${primaryContact.title ? `, ${primaryContact.title}` : ""} (${primaryContact.role})` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    system: `You are preparing interview preparation materials for a recruiter in Japan to share with and use for a candidate going into CCM${ccm_number}.

Generate two outputs:

1. candidate_email: A preparation email the recruiter sends to the candidate. Plain text, no markdown. Sections (use ALL CAPS labels):
ABOUT [COMPANY NAME]: 2-3 sentences from client intelligence. Specific, not generic.
THIS INTERVIEW: What to expect in CCM${ccm_number}, who they are meeting if known.
KEY THEMES: 2-3 likely topics based on the role and interviewer notes.
YOUR POSITIONING: How to frame their background for this role.
SALARY: One sentence on Japan salary discussion norms (they may be asked their current salary).
PRACTICE: "For mock interview practice, use this prompt in ChatGPT or Claude:" followed by a specific AI prompt tailored to this role and candidate background.

2. recruiter_prep_note: 3-4 bullet points for the recruiter's prep call with the candidate. What to remind them. What to reinforce. What to watch for. Plain text.

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Clear English.

Return valid JSON only — no markdown fences:
{
  "candidate_email": string,
  "recruiter_prep_note": string
}`,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { candidate_email: string; recruiter_prep_note: string };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
