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

  const { candidate_id, requisition_id } = req.body as {
    candidate_id: string;
    requisition_id: string;
  };

  if (!candidate_id || !requisition_id) {
    return res.status(400).json({ error: "candidate_id and requisition_id are required" });
  }

  const [{ data: candidate }, { data: motivations }, { data: roles }, { data: requisition }, { data: conditions }] =
    await Promise.all([
      supabase
        .from("candidates")
        .select(
          "full_name, current_company, current_title, japanese_level, english_level, ai_context, notes_pitch",
        )
        .eq("id", candidate_id)
        .single(),
      supabase
        .from("candidate_motivations")
        .select("rank, motivation_text, motivation_type")
        .eq("candidate_id", candidate_id)
        .order("rank"),
      supabase
        .from("candidate_roles")
        .select("company_name, title, is_current")
        .eq("candidate_id", candidate_id)
        .eq("is_current", true)
        .limit(1),
      supabase
        .from("requisitions")
        .select(
          "title, jd_text, strategic_context, salary_min, salary_max, clients ( company_name, ai_context, years_in_japan, employee_japanese_pct )",
        )
        .eq("id", requisition_id)
        .single(),
      supabase
        .from("requisition_conditions")
        .select("condition_text, condition_type, priority_rank")
        .eq("requisition_id", requisition_id)
        .eq("condition_type", "must_have")
        .order("priority_rank")
        .limit(5),
    ]);

  if (!candidate || !requisition) return res.status(404).json({ error: "Data not found" });

  const c = candidate as {
    full_name: string;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    ai_context: string | null;
    notes_pitch: string | null;
  };

  const r = requisition as {
    title: string;
    jd_text: string | null;
    strategic_context: string | null;
    salary_min: number | null;
    salary_max: number | null;
    clients: {
      company_name: string;
      ai_context: string | null;
      years_in_japan: number | null;
      employee_japanese_pct: number | null;
    } | null;
  };

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");
  const currentRole = (roles ?? [])[0] as { company_name: string; title: string | null } | undefined;

  const prompt = `
Candidate: ${c.full_name}
Current: ${c.current_title ?? currentRole?.title ?? "—"} at ${c.current_company ?? currentRole?.company_name ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}

Top motivations (ranked — motivation rank 1 gets the strongest pitch point):
${(motivations ?? []).map((m: { rank: number; motivation_type: string | null; motivation_text: string }) => `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`).join("\n")}

${c.notes_pitch ? `Recruiter pitch notes: ${c.notes_pitch.slice(0, 300)}` : ""}
${c.ai_context ? `Candidate intelligence: ${c.ai_context.slice(0, 500)}` : ""}

Role: ${r.title} at ${r.clients?.company_name ?? "—"}
Salary: ${formatYen(r.salary_min)}–${formatYen(r.salary_max)}
${r.strategic_context ? `Strategic context: ${r.strategic_context.slice(0, 400)}` : ""}
${r.clients?.years_in_japan ? `Company years in Japan: ${r.clients.years_in_japan}` : ""}
${r.clients?.employee_japanese_pct != null ? `Japanese team %: ${r.clients.employee_japanese_pct}%` : ""}
${r.clients?.ai_context ? `Client intelligence: ${r.clients.ai_context.slice(0, 300)}` : ""}

Must-have conditions:
${(conditions ?? []).map((cond: { condition_text: string }) => `- ${cond.condition_text}`).join("\n")}

${r.jd_text ? `JD excerpt:\n${r.jd_text.slice(0, 800)}` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `You are writing a candidate outreach email and talking points for a recruiter in Japan. The recruiter will send this to the candidate to pitch a role before buy-in is secured.

Rules:
- The email must be bespoke. Reference the candidate's specific background.
- Connect their top-ranked motivation to the role's strongest matching point. Motivation rank 1 drives the opening.
- 150 words maximum for the email. Conversational, not a template.
- Talking points: 3 bullets. Key highlights only. Not a script — the recruiter uses these if calling instead of emailing.
- NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.
- Frame the role as an opportunity worth considering — not a must-apply.

Return valid JSON only — no markdown fences, no explanation:
{
  "email": string,
  "talking_points": [string, string, string]
}`,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { email: string; talking_points: string[] };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
