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

  const { candidate_ids, requisition_id } = req.body as {
    candidate_ids: string[];
    requisition_id: string;
  };

  if (!candidate_ids?.length || !requisition_id) {
    return res.status(400).json({ error: "candidate_ids and requisition_id are required" });
  }

  const [{ data: candidates }, { data: requisition }] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, full_name_japanese, age, current_title, current_company, japanese_level, english_level, notice_period_months, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_pitch, notes_personality, notes_closing",
      )
      .in("id", candidate_ids),
    supabase
      .from("requisitions")
      .select(
        "title, salary_min, salary_max, salary_range_text, location, strategic_context, clients(company_name, strategy_notes)",
      )
      .eq("id", requisition_id)
      .single(),
  ]);

  if (!candidates?.length || !requisition) {
    return res.status(404).json({ error: "Data not found" });
  }

  const r = requisition as {
    title: string;
    salary_min: number | null;
    salary_max: number | null;
    salary_range_text: string | null;
    location: string | null;
    strategic_context: string | null;
    clients: { company_name: string; strategy_notes: string | null } | null;
  };

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : null);
  const salaryLine = r.salary_range_text ?? [formatYen(r.salary_min), formatYen(r.salary_max)].filter(Boolean).join("–");
  const clientName = r.clients?.company_name ?? "your company";

  const candidateBlocks = (candidates as {
    id: string;
    full_name: string;
    full_name_japanese: string | null;
    age: number | null;
    current_title: string | null;
    current_company: string | null;
    japanese_level: string | null;
    english_level: string | null;
    notice_period_months: number | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean | null;
    base_minimum: number | null;
    notes_pitch: string | null;
    notes_personality: string | null;
    notes_closing: string | null;
  }[]).map((c, i) => {
    const compLines = [
      c.current_total ? `Current total: ${formatYen(c.current_total)}` : null,
      (c.expected_total_min || c.expected_total_max)
        ? `Expectation: ${[formatYen(c.expected_total_min ?? null), formatYen(c.expected_total_max ?? null)].filter(Boolean).join("–")}`
        : null,
      c.base_is_priority && c.base_minimum ? `Base floor: ${formatYen(c.base_minimum)} (priority)` : null,
    ].filter(Boolean).join(" · ");

    return `CANDIDATE ${i + 1}: ${c.full_name}${c.full_name_japanese ? ` (${c.full_name_japanese})` : ""}
Age: ${c.age ?? "not recorded"}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "?"} / English ${c.english_level ?? "?"}
Notice period: ${c.notice_period_months != null ? `${c.notice_period_months} months` : "not recorded"}
${compLines ? `Compensation: ${compLines}` : ""}
${c.notes_pitch ? `Why they're interested: ${c.notes_pitch.slice(0, 200)}` : ""}
${c.notes_personality ? `Personality: ${c.notes_personality.slice(0, 150)}` : ""}
${c.notes_closing ? `Closing notes: ${c.notes_closing.slice(0, 150)}` : ""}`;
  }).join("\n\n---\n\n");

  const prompt = `You are a senior Japan-market agency recruiter writing a candidate introduction email to a hiring manager.

ROLE: ${r.title} at ${clientName}
${salaryLine ? `Salary range: ${salaryLine}` : ""}
${r.location ? `Location: ${r.location}` : ""}
${r.strategic_context ? `Context: ${r.strategic_context}` : ""}
${r.clients?.strategy_notes ? `Client notes: ${r.clients.strategy_notes.slice(0, 300)}` : ""}

${candidateBlocks}

Write a professional candidate introduction email from the recruiter to the hiring manager.

Structure:
1. Brief opening — one sentence referencing the role and that you are introducing ${candidates.length} candidate${candidates.length > 1 ? "s" : ""} for their review
2. For each candidate: 3–4 sentences covering their background, language capability, why they are a strong fit for this role specifically, and their compensation expectation. Reference the client context where relevant.
3. Closing — one short sentence asking to schedule brief calls or interviews

Rules:
- Write as if the reader is senior and time-pressed. Be direct.
- Each candidate section should feel tailored, not templated. Use their actual background.
- Compensation: always frame as "seeking" or "targeting" — never as a demand
- Plain English — the reader may not be a native speaker
- Never use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.
- No bullet points — flowing professional prose for each candidate

Return valid JSON only — no markdown, no explanation:
{ "subject": "string", "body": "string" }`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { subject: string; body: string };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Could not generate CV send email. Try again.", raw });
  }
}
