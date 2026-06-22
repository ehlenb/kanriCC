import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const formatYen = (n: number | null) =>
  n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";

async function refreshCandidate(entityId: string, triggeredById?: string) {
  const [
    { data: candidate },
    { data: motivations },
    { data: blockers },
    { data: competing },
    { data: interactions },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "recruiter_id, full_name, current_company, current_title, japanese_level, english_level, candidate_status, current_base, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notice_period_months, notes_personality, notes_pitch, notes_closing",
      )
      .eq("id", entityId)
      .single(),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text, motivation_type")
      .eq("candidate_id", entityId)
      .order("rank"),
    supabase
      .from("candidate_blockers")
      .select("theme, detail, is_risk")
      .eq("candidate_id", entityId),
    supabase
      .from("competing_interviews")
      .select("company_name, stage")
      .eq("candidate_id", entityId)
      .eq("is_active", true),
    supabase
      .from("interactions")
      .select("interaction_type, summary, full_notes, interacted_at, direction")
      .eq("candidate_id", entityId)
      .order("interacted_at", { ascending: false })
      .limit(30),
  ]);

  if (!candidate) throw new Error("Candidate not found");

  const c = candidate as {
    recruiter_id: string;
    full_name: string;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    candidate_status: string;
    current_base: number | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean;
    base_minimum: number | null;
    notice_period_months: number | null;
    notes_personality: string | null;
    notes_pitch: string | null;
    notes_closing: string | null;
  };

  const now = Date.now();
  const categorise = (iso: string) => {
    const days = (now - new Date(iso).getTime()) / 86400000;
    if (days <= 30) return "current";
    if (days <= 90) return "recent";
    return "background";
  };

  const interactionLines = (interactions ?? []).map((i: {
    interaction_type: string;
    summary: string | null;
    full_notes: string | null;
    interacted_at: string;
    direction: string | null;
  }) => {
    const weight = categorise(i.interacted_at);
    const date = new Date(i.interacted_at).toLocaleDateString("en-GB");
    const notes = i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes";
    return `[${weight.toUpperCase()}] ${date} ${i.interaction_type}${i.direction ? ` (${i.direction})` : ""}: ${notes}`;
  });

  const prompt = `
Candidate: ${c.full_name}
Status: ${c.candidate_status}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Compensation: current total ${formatYen(c.current_total)} (base ${formatYen(c.current_base)}), target ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}
Notice period: ${c.notice_period_months ?? "—"} months

Top motivations:
${(motivations ?? []).map((m: { rank: number; motivation_type: string | null; motivation_text: string }) => `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`).join("\n")}

Blockers and constraints:
${(blockers ?? []).map((b: { theme: string; detail: string | null; is_risk: boolean }) => `${b.is_risk ? "[RISK]" : "[CONTEXT]"} ${b.theme}: ${b.detail ?? ""}`).join("\n")}

Active competing interviews:
${(competing ?? []).length === 0 ? "None disclosed." : (competing ?? []).map((ci: { company_name: string; stage: string | null }) => `- ${ci.company_name}${ci.stage ? ` (${ci.stage})` : ""}`).join("\n")}

${c.notes_personality ? `Personality: ${c.notes_personality.slice(0, 200)}` : ""}
${c.notes_pitch ? `Pitch notes: ${c.notes_pitch.slice(0, 200)}` : ""}
${c.notes_closing ? `Closing intelligence: ${c.notes_closing.slice(0, 200)}` : ""}

Interaction history (recency-weighted):
${interactionLines.join("\n")}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 900,
    system: `You are writing an internal recruiter briefing note for a senior recruiter's reference file.

Write as a senior recruiter summarising what they know about this candidate right now.
Use past tense for history. Use present tense for current state.
Recency weighting: [CURRENT] interactions = definitive. [RECENT] = relevant context. [BACKGROUND] = background only.
If a recent interaction contradicts an older one (e.g. salary changed), the recent value wins. Note the change: "Salary expectation updated to X (was Y at registration)."
Maximum 900 tokens. Be ruthless about what matters.
Plain English. Short sentences. No bullet lists — use short paragraphs.
Do not include anything from notes_internal or notes_presentation.
Never fabricate. If data is thin, say so briefly.
Do not start with the candidate's name as the first word.
NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`,
    messages: [{ role: "user", content: prompt }],
  });

  const contextText = message.content[0].type === "text" ? message.content[0].text : "";
  const tokensUsed = message.usage.output_tokens;

  await Promise.all([
    supabase
      .from("candidates")
      .update({ ai_context: contextText, ai_context_updated_at: new Date().toISOString() })
      .eq("id", entityId),
    supabase.from("ai_context_log").insert({
      recruiter_id: c.recruiter_id,
      entity_type: "candidate",
      entity_id: entityId,
      triggered_by_interaction_id: triggeredById ?? null,
      tokens_used: tokensUsed,
    }),
  ]);
}

async function refreshClient(entityId: string, triggeredById?: string) {
  const [
    { data: client },
    { data: contacts },
    { data: interactions },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "recruiter_id, company_name, japan_team_size, japan_role_in_group, years_in_japan, employee_japanese_pct, strategy_notes, is_active, contract_signed, kk_entity",
      )
      .eq("id", entityId)
      .single(),
    supabase
      .from("client_contacts")
      .select("name, title, role, relationship_score, is_primary")
      .eq("client_id", entityId),
    supabase
      .from("interactions")
      .select("interaction_type, summary, full_notes, interacted_at")
      .eq("client_id", entityId)
      .order("interacted_at", { ascending: false })
      .limit(30),
  ]);

  if (!client) throw new Error("Client not found");

  const cl = client as {
    recruiter_id: string;
    company_name: string;
    japan_team_size: number | null;
    japan_role_in_group: string | null;
    years_in_japan: number | null;
    employee_japanese_pct: number | null;
    strategy_notes: string | null;
    is_active: boolean;
    contract_signed: boolean;
    kk_entity: string | null;
  };

  const now = Date.now();
  const categorise = (iso: string) => {
    const days = (now - new Date(iso).getTime()) / 86400000;
    if (days <= 30) return "current";
    if (days <= 90) return "recent";
    return "background";
  };

  const interactionLines = (interactions ?? []).map((i: {
    interaction_type: string;
    summary: string | null;
    full_notes: string | null;
    interacted_at: string;
  }) => {
    const weight = categorise(i.interacted_at);
    const date = new Date(i.interacted_at).toLocaleDateString("en-GB");
    const notes = i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes";
    return `[${weight.toUpperCase()}] ${date} ${i.interaction_type}: ${notes}`;
  });

  const prompt = `
Company: ${cl.company_name} (${cl.is_active ? "active" : "inactive"})
Japan team: ${cl.japan_team_size ?? "—"} | Role in group: ${cl.japan_role_in_group ?? "—"}
Years in Japan: ${cl.years_in_japan ?? "—"} | Japanese team %: ${cl.employee_japanese_pct != null ? `${cl.employee_japanese_pct}%` : "—"}
KK entity: ${cl.kk_entity ?? "—"} | Contract signed: ${cl.contract_signed ? "Yes" : "No"}

Contacts:
${(contacts ?? []).map((c: { name: string; title: string | null; role: string; relationship_score: number | null; is_primary: boolean }) => `- ${c.name}, ${c.title ?? c.role}${c.is_primary ? " (primary)" : ""}${c.relationship_score ? ` — relationship ${c.relationship_score}/5` : ""}`).join("\n")}

${cl.strategy_notes ? `Strategy notes: ${cl.strategy_notes.slice(0, 400)}` : ""}

Interaction history (recency-weighted):
${interactionLines.join("\n")}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 900,
    system: `You are writing an internal account briefing note for a senior recruiter's reference file.

Write as a senior recruiter summarising their knowledge of this client account.
Use past tense for history. Use present tense for current state.
Recency weighting: [CURRENT] interactions = definitive. [RECENT] = relevant context. [BACKGROUND] = background only.
Cover: relationship status, hiring patterns, key contacts and their stance, any open or recurring needs, risks.
Maximum 900 tokens. Be ruthless about what matters.
Plain English. Short sentences. No bullet lists — short paragraphs.
Never fabricate. If data is thin, say so briefly.
NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`,
    messages: [{ role: "user", content: prompt }],
  });

  const contextText = message.content[0].type === "text" ? message.content[0].text : "";
  const tokensUsed = message.usage.output_tokens;

  await Promise.all([
    supabase
      .from("clients")
      .update({ ai_context: contextText, ai_context_updated_at: new Date().toISOString() })
      .eq("id", entityId),
    supabase.from("ai_context_log").insert({
      recruiter_id: cl.recruiter_id,
      entity_type: "client",
      entity_id: entityId,
      triggered_by_interaction_id: triggeredById ?? null,
      tokens_used: tokensUsed,
    }),
  ]);
}

async function refreshRequisition(entityId: string, triggeredById?: string) {
  const [
    { data: req },
    { data: conditions },
    { data: interactions },
  ] = await Promise.all([
    supabase
      .from("requisitions")
      .select(
        "recruiter_id, title, jd_text, strategic_context, salary_min, salary_max, salary_stretch, urgency, interview_steps, interview_notes, is_open",
      )
      .eq("id", entityId)
      .single(),
    supabase
      .from("requisition_conditions")
      .select("condition_text, condition_type, source, priority_rank")
      .eq("requisition_id", entityId)
      .order("priority_rank"),
    supabase
      .from("interactions")
      .select("interaction_type, summary, full_notes, interacted_at")
      .eq("requisition_id", entityId)
      .order("interacted_at", { ascending: false })
      .limit(20),
  ]);

  if (!req) throw new Error("Requisition not found");

  const r = req as {
    recruiter_id: string;
    title: string;
    jd_text: string | null;
    strategic_context: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_stretch: number | null;
    urgency: string;
    interview_steps: number | null;
    interview_notes: string | null;
    is_open: boolean;
  };

  const prompt = `
Role: ${r.title} (${r.urgency}) — ${r.is_open ? "open" : "closed"}
Salary: ${formatYen(r.salary_min)}–${formatYen(r.salary_max)}${r.salary_stretch ? ` (stretch ${formatYen(r.salary_stretch)})` : ""}
Interview process: ${r.interview_steps ?? "—"} rounds. ${r.interview_notes ?? ""}

Key conditions (priority order):
${(conditions ?? []).map((c: { condition_type: string; source: string; condition_text: string }) => `[${c.condition_type.toUpperCase()}${c.source === "client" ? "/CLIENT" : ""}] ${c.condition_text}`).join("\n")}

${r.strategic_context ? `Strategic context: ${r.strategic_context.slice(0, 400)}` : ""}

Interaction history:
${(interactions ?? []).map((i: { interaction_type: string; summary: string | null; full_notes: string | null; interacted_at: string }) => {
  const date = new Date(i.interacted_at).toLocaleDateString("en-GB");
  return `- ${date} ${i.interaction_type}: ${i.full_notes?.slice(0, 200) ?? i.summary ?? "No notes"}`;
}).join("\n")}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 900,
    system: `You are writing an internal requisition briefing note for a senior recruiter's reference file.

Summarise the current state of this requisition. Cover: what the role is, what the client really needs (focus on must-have conditions), the interview process, salary reality vs. market, and any intelligence from interactions with the client about this role.
Plain English. Short sentences. No bullet lists — short paragraphs.
Maximum 900 tokens.
NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`,
    messages: [{ role: "user", content: prompt }],
  });

  const contextText = message.content[0].type === "text" ? message.content[0].text : "";
  const tokensUsed = message.usage.output_tokens;

  await Promise.all([
    supabase
      .from("requisitions")
      .update({ ai_context: contextText, ai_context_updated_at: new Date().toISOString() })
      .eq("id", entityId),
    supabase.from("ai_context_log").insert({
      recruiter_id: r.recruiter_id,
      entity_type: "requisition",
      entity_id: entityId,
      triggered_by_interaction_id: triggeredById ?? null,
      tokens_used: tokensUsed,
    }),
  ]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { entity_type, entity_id, triggered_by_interaction_id } = req.body as {
    entity_type: string;
    entity_id: string;
    triggered_by_interaction_id?: string;
  };

  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: "Missing entity_type or entity_id" });
  }

  try {
    if (entity_type === "candidate") {
      await refreshCandidate(entity_id, triggered_by_interaction_id);
    } else if (entity_type === "client") {
      await refreshClient(entity_id, triggered_by_interaction_id);
    } else if (entity_type === "requisition") {
      await refreshRequisition(entity_id, triggered_by_interaction_id);
    } else {
      return res.status(400).json({ error: `Unknown entity_type: ${entity_type}` });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return res.status(200).json({ error: message });
  }
}
