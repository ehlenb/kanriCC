import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ProfileContent, SubmissionPackage } from "../../src/integrations/supabase/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WRITING_RULES = `WRITING RULES:
- Never use these words: straightforward, genuinely, honestly, utilize, demonstrates, exhibits, possesses, trajectory, spanning, rigorous, deterministic. Never use "leverage" as a verb.
- Never use em dashes. Use commas or separate sentences instead.
- Write at approximately TOEIC 700 level. Short, common business words. Prefer: shows, has, covers, built, led, worked on.
- One idea per sentence. No nested clauses.
- Plain, clear, professional English. Readers are Japanese hiring managers reading in their second language. No idioms. No jargon.
- All monetary values: ¥XM format (e.g. ¥12.5M total, ¥10M base + ¥2M bonus).
- Never fabricate or guess. If data is missing, omit that section.
- Tone: warm, professional, and advocate-forward.
- Do not mention prior meetings or prior introductions.
- Do not include negotiation strategy. Compensation sections are factual only.
- Frame the candidate as a selective, considered professional. Never imply urgency or active job-seeking.`;

function stripJsonFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function composeEmail(
  contactName: string,
  jobTitle: string,
  candidateName: string,
  emailBlurb: string,
  snapshot: ProfileContent["snapshot"],
): { subject: string; body: string } {
  const subject = `Candidate Introduction – ${jobTitle} (${candidateName})`;

  const compParts: string[] = [];
  if (snapshot.currentComp) compParts.push(`Current: ${snapshot.currentComp}`);
  if (snapshot.targetComp) compParts.push(`Target: ${snapshot.targetComp}`);

  const lines: string[] = [
    `Hello ${contactName},`,
    "",
    `Thank you as always for your collaboration on the ${jobTitle} position.`,
    "",
    `I am pleased to introduce ${candidateName} for your consideration.`,
    "",
    [snapshot.name, snapshot.title, snapshot.company].filter(Boolean).join(", "),
  ];

  if (compParts.length) lines.push(compParts.join(" | "));
  lines.push(emailBlurb);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "Please find the candidate profile attached for your review. I am happy to arrange an introduction at your earliest convenience.",
  );
  lines.push("");
  lines.push("[Recruiter Name]");
  lines.push("[Agency Name]");

  return { subject, body: lines.join("\n") };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidate_id, requisition_id, process_id } = req.body as {
    candidate_id: string;
    requisition_id: string;
    process_id: string;
  };

  if (!candidate_id || !requisition_id || !process_id) {
    return res.status(400).json({ error: "candidate_id, requisition_id, and process_id are required" });
  }

  const [
    { data: candidate },
    { data: motivations },
    { data: blockers },
    { data: roles },
    { data: requisition },
    { data: conditions },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, age, current_company, current_title, japanese_level, english_level, current_base, current_bonus, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_personality, notes_pitch, ai_context",
      )
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text, motivation_type")
      .eq("candidate_id", candidate_id)
      .order("rank"),
    supabase
      .from("candidate_blockers")
      .select("theme, detail, is_risk")
      .eq("candidate_id", candidate_id),
    supabase
      .from("candidate_roles")
      .select("company_name, title, start_date, end_date, is_current, achievement_notes, reason_for_leaving_raw")
      .eq("candidate_id", candidate_id)
      .order("start_date", { ascending: true }),
    supabase
      .from("requisitions")
      .select(
        "title, jd_text, salary_min, salary_max, strategic_context, interview_notes, clients ( company_name, ai_context, years_in_japan, employee_japanese_pct, client_contacts ( name, title, role, is_primary ) )",
      )
      .eq("id", requisition_id)
      .single(),
    supabase
      .from("requisition_conditions")
      .select("condition_text, condition_type, source, priority_rank")
      .eq("requisition_id", requisition_id)
      .order("priority_rank"),
  ]);

  if (!candidate || !requisition) {
    return res.status(404).json({ error: "Candidate or requisition not found" });
  }

  const c = candidate as {
    full_name: string;
    full_name_japanese: string | null;
    age: number | null;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    current_base: number | null;
    current_bonus: number | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean;
    base_minimum: number | null;
    notes_personality: string | null;
    notes_pitch: string | null;
    ai_context: string | null;
  };

  const r = requisition as {
    title: string;
    jd_text: string | null;
    salary_min: number | null;
    salary_max: number | null;
    strategic_context: string | null;
    interview_notes: string | null;
    clients: {
      company_name: string;
      ai_context: string | null;
      years_in_japan: number | null;
      employee_japanese_pct: number | null;
      client_contacts: Array<{ name: string; title: string | null; role: string; is_primary: boolean }>;
    } | null;
  };

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const primaryContact = r.clients?.client_contacts?.find((cc) => cc.is_primary) ?? r.clients?.client_contacts?.[0];
  const contactName = primaryContact?.name ?? "Hiring Manager";

  const rolesText = (roles ?? [])
    .map((role: {
      company_name: string;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
      is_current: boolean;
      achievement_notes: string | null;
      reason_for_leaving_raw: string | null;
    }) =>
      `- ${role.company_name}${role.is_current ? " (current)" : ""}: ${role.title ?? "—"}. ${role.achievement_notes?.slice(0, 300) ?? ""}${role.reason_for_leaving_raw && !role.is_current ? ` Reason for leaving: ${role.reason_for_leaving_raw.slice(0, 100)}` : ""}`,
    )
    .join("\n");

  const mustHaveConditions = (conditions ?? [])
    .filter((cond: { condition_type: string }) => cond.condition_type === "must_have")
    .map((cond: { condition_text: string; priority_rank: number }) => `${cond.priority_rank}. ${cond.condition_text}`)
    .join("\n");

  const candidateContext = `
Candidate: ${c.full_name}${c.full_name_japanese ? ` (${c.full_name_japanese})` : ""}${c.age ? `, age ${c.age}` : ""}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Compensation: current ${formatYen(c.current_total)} (base ${formatYen(c.current_base)}${c.current_bonus ? ` + bonus ${formatYen(c.current_bonus)}` : ""}), target ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}

Career history:
${rolesText}

Top motivations (ranked by candidate):
${(motivations ?? []).map((m: { rank: number; motivation_type: string | null; motivation_text: string }) => `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`).join("\n")}

${(blockers ?? []).length > 0 ? `Blockers and constraints:\n${(blockers ?? []).map((b: { theme: string; detail: string | null; is_risk: boolean }) => `${b.is_risk ? "[RISK]" : "[CONTEXT]"} ${b.theme}: ${b.detail ?? ""}`).join("\n")}` : ""}

${c.notes_pitch ? `Pitch notes: ${c.notes_pitch.slice(0, 300)}` : ""}
${c.ai_context ? `Candidate intelligence summary:\n${c.ai_context.slice(0, 600)}` : ""}`;

  const roleContext = `
Role: ${r.title} at ${r.clients?.company_name ?? "—"}
Salary range: ${formatYen(r.salary_min)}–${formatYen(r.salary_max)}
${r.strategic_context ? `Strategic context: ${r.strategic_context.slice(0, 400)}` : ""}
${r.interview_notes ? `Interview process: ${r.interview_notes.slice(0, 200)}` : ""}

Must-have conditions (address each specifically in alignment points):
${mustHaveConditions || "None extracted from JD."}

${r.jd_text ? `Job description excerpt:\n${r.jd_text.slice(0, 1500)}` : ""}

Client: ${r.clients?.company_name ?? "—"}
${r.clients?.years_in_japan ? `Years in Japan: ${r.clients.years_in_japan}` : ""}
${r.clients?.employee_japanese_pct != null ? `Japanese team %: ${r.clients.employee_japanese_pct}%` : ""}
${r.clients?.ai_context ? `Client intelligence:\n${r.clients.ai_context.slice(0, 400)}` : ""}`;

  const englishPrompt = `You are a senior Japan bilingual talent agency recruiter writing a candidate submission.

${WRITING_RULES}

The alignment array must explicitly address the must-have conditions listed below. Each alignment point should reference a specific condition the candidate meets.

Generate structured submission content. Return valid JSON only — no markdown fences, no explanation.

${candidateContext}

${roleContext}

Return exactly this JSON structure:
{
  "emailBlurb": "2-3 sentences. Quick background summary aligned to the role. Specific reason why this candidate fits. No filler. No prior meeting assumptions.",
  "snapshot": {
    "name": "${c.full_name}",
    "title": ${c.current_title ? `"${c.current_title}"` : "null"},
    "company": ${c.current_company ? `"${c.current_company}"` : "null"},
    "age": ${c.age ? `"${c.age}"` : "null"},
    "currentComp": "¥XM total format or null",
    "targetComp": "¥XM to ¥XM format or null"
  },
  "executiveSummary": "3-5 sentences. Concise career arc and key strengths. No filler.",
  "careerMotivation": "2-3 sentences. What they are looking for and why. Specific, not generic.",
  "alignment": ["Specific strength addressing a must-have condition", "Another alignment point", "Third alignment point", "Fourth if supported — max 4 total"],
  "compensation": "2-3 sentences. State current and target factually. No negotiation strategy.",
  "closing": "RECRUITER ASSESSMENT: 2-3 sentences. State your recommendation clearly. Who this candidate is, why they fit, what the client should do next. No italics. No closing pleasantries."
}`;

  try {
    const [englishMsg, processData] = await Promise.all([
      anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        messages: [{ role: "user", content: englishPrompt }],
      }),
      supabase
        .from("processes")
        .select("stage, cv_sent_at")
        .eq("id", process_id)
        .single(),
    ]);

    const englishRaw = englishMsg.content[0]?.type === "text" ? englishMsg.content[0].text.trim() : "";
    const englishParsed = JSON.parse(stripJsonFences(englishRaw)) as {
      emailBlurb: string;
      snapshot: ProfileContent["snapshot"];
      executiveSummary: string;
      careerMotivation: string;
      alignment: string[];
      compensation: string;
      closing: string;
    };

    const translationPrompt = `Translate the following candidate profile JSON into natural, professional Japanese suitable for Japanese corporate communication.

Rules:
- Keep all JSON keys in English.
- The client company name "${r.clients?.company_name ?? ""}" must remain in its original form.
- Candidate company names and product names remain as-is.
- Translate all text values to natural Japanese — not word-for-word, but as a Japanese recruitment professional would write.
- Preserve all structure: arrays stay arrays, nulls stay null.
- Return valid JSON only. No markdown fences, no explanation.

${JSON.stringify({
  snapshot: englishParsed.snapshot,
  executiveSummary: englishParsed.executiveSummary,
  careerMotivation: englishParsed.careerMotivation,
  alignment: englishParsed.alignment,
  compensation: englishParsed.compensation,
  closing: englishParsed.closing,
}, null, 2)}`;

    const japaneseMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [{ role: "user", content: translationPrompt }],
    });

    const japaneseRaw = japaneseMsg.content[0]?.type === "text" ? japaneseMsg.content[0].text.trim() : "";
    const japaneseParsed = JSON.parse(stripJsonFences(japaneseRaw)) as ProfileContent;

    const email = composeEmail(
      contactName,
      r.title,
      c.full_name,
      englishParsed.emailBlurb,
      englishParsed.snapshot,
    );

    const result: SubmissionPackage = {
      email,
      englishContent: {
        snapshot: englishParsed.snapshot,
        executiveSummary: englishParsed.executiveSummary,
        careerMotivation: englishParsed.careerMotivation,
        alignment: englishParsed.alignment,
        compensation: englishParsed.compensation,
        closing: englishParsed.closing,
      },
      japaneseContent: japaneseParsed,
    };

    // Side effects: log interaction, advance stage
    const proc = processData.data as { stage: string; cv_sent_at: string | null } | null;
    const now = new Date().toISOString();

    const sideEffects: Promise<unknown>[] = [
      supabase.from("interactions").insert({
        candidate_id,
        requisition_id,
        process_id,
        interaction_type: "cv_sent",
        direction: "outbound",
        summary: `${c.full_name} submission package generated for ${r.clients?.company_name ?? "client"} – ${r.title}`,
        interacted_at: now,
        triggers_context_refresh: false,
      }),
      supabase
        .from("candidates")
        .update({ last_interaction_at: now })
        .eq("id", candidate_id),
    ];

    if (proc) {
      const updates: Record<string, string> = { last_activity_at: now };
      if (!proc.cv_sent_at) updates.cv_sent_at = now;
      if (proc.stage === "Buy-In") updates.stage = "CV Sent";
      sideEffects.push(supabase.from("processes").update(updates).eq("id", process_id));
    }

    await Promise.all(sideEffects);

    // Fire context refresh (best-effort)
    fetch(`${process.env.API_BASE_URL}/api/ai/refresh-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: "candidate", entity_id: candidate_id }),
    }).catch(() => {});

    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission package generation failed";
    return res.status(200).json({ error: message });
  }
}
