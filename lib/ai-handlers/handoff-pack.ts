import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

const HANDOFF_SYSTEM_PROMPT = `You are writing a handoff briefing so a colleague with zero prior context can take over this account cold — because the recruiter who owns it is out sick, on leave, or has left the firm. This is not a status update for the owning recruiter; assume the reader has never touched this account before.

Structure the briefing with these headers, in this order, using **bold** for headers and • for bullets:

**Current state**
Where things actually stand right now, in plain terms.

**Pipeline position**
Every active thread — candidate, client, requisition, stage — and where each one sits.

**Open threads**
What is pending right now and who is waiting on whom. Be specific: what needs to happen next and by when, if known.

**Key people**
Who matters here and what to know about them before contacting them.

**What to do next**
The single most useful first action a colleague picking this up cold should take.

Recency weighting: [CURRENT] interactions (last 30 days) are definitive. [RECENT] (31-90 days) are relevant context. [BACKGROUND] (90+ days) are background only.

Be comprehensive, not terse — the reader has no other context to draw on, so do not assume familiarity or omit detail for brevity. Still, never fabricate: if something is not known, say so plainly rather than guessing.

Plain English. Short sentences. NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`;

type InteractionRow = {
  interaction_type: string;
  summary: string | null;
  full_notes: string | null;
  interacted_at: string;
  direction: string | null;
};

function categorise(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days <= 30) return "current";
  if (days <= 90) return "recent";
  return "background";
}

function interactionLines(interactions: InteractionRow[] | null) {
  return (interactions ?? []).map((i) => {
    const weight = categorise(i.interacted_at);
    const date = new Date(i.interacted_at).toLocaleDateString("en-GB");
    const notes = i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes";
    return `[${weight.toUpperCase()}] ${date} ${i.interaction_type}${i.direction ? ` (${i.direction})` : ""}: ${notes}`;
  });
}

async function buildCandidateHandoff(entityId: string): Promise<string> {
  const [
    { data: candidate },
    { data: motivations },
    { data: blockers },
    { data: competing },
    { data: interactions },
    { data: processes },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, current_company, current_title, japanese_level, english_level, candidate_status, current_base, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notice_period_months, notes_personality, notes_pitch, notes_closing, notes_interview, ai_context",
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
    supabase
      .from("processes")
      .select("stage, coverage_type, requisitions ( title, clients ( company_name, ai_context ) )")
      .eq("candidate_id", entityId)
      .not("stage", "in", '("Placed","Closed lost")'),
  ]);

  if (!candidate) throw new Error("Candidate not found");

  const c = candidate as {
    full_name: string;
    full_name_japanese: string | null;
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
    notes_interview: string | null;
    ai_context: string | null;
  };

  type ProcessRow = {
    stage: string;
    coverage_type: string;
    requisitions: { title: string; clients: { company_name: string; ai_context: string | null } | null } | null;
  };
  const procs = (processes ?? []) as unknown as ProcessRow[];

  const pipelineText = procs.length === 0
    ? "No active process right now."
    : procs
        .map((p) => {
          const req = p.requisitions;
          const client = req?.clients;
          return `- ${req?.title ?? "Unknown role"} at ${client?.company_name ?? "Unknown client"} — stage ${p.stage} (coverage: ${p.coverage_type})
${client?.ai_context ? `  Client account context: ${client.ai_context}` : "  No reconciled client context on file yet."}`;
        })
        .join("\n\n");

  const prompt = `
HANDOFF PACK: CANDIDATE — ${c.full_name}${c.full_name_japanese ? ` (${c.full_name_japanese})` : ""}

Status: ${c.candidate_status}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Compensation: current total ${formatYen(c.current_total)} (base ${formatYen(c.current_base)}), target ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}
Notice period: ${c.notice_period_months ?? "—"} months

RECONCILED CANDIDATE MEMORY (most current understanding of this candidate):
${c.ai_context ?? "No reconciled context on file yet — rely on the raw interaction history below."}

ACTIVE PIPELINE:
${pipelineText}

Top motivations (ranked):
${(motivations ?? []).map((m) => `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`).join("\n") || "None recorded."}

Blockers and constraints:
${(blockers ?? []).map((b) => `${b.is_risk ? "[RISK]" : "[CONTEXT]"} ${b.theme}: ${b.detail ?? ""}`).join("\n") || "None recorded."}

Active competing interviews:
${(competing ?? []).length === 0 ? "None disclosed." : (competing ?? []).map((ci) => `- ${ci.company_name}${ci.stage ? ` (${ci.stage})` : ""}`).join("\n")}

${c.notes_personality ? `Personality notes: ${c.notes_personality}` : ""}
${c.notes_pitch ? `Pitch notes: ${c.notes_pitch}` : ""}
${c.notes_closing ? `Closing intelligence: ${c.notes_closing}` : ""}
${c.notes_interview ? `Interview notes: ${c.notes_interview}` : ""}

RAW INTERACTION HISTORY (recency-weighted, most recent first):
${interactionLines(interactions).join("\n") || "No interactions logged."}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3000,
    thinking: { type: "disabled" },
    system: HANDOFF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content.find((b) => b.type === "text")?.text ?? "";
}

async function buildClientHandoff(entityId: string): Promise<string> {
  const [
    { data: client },
    { data: contacts },
    { data: interactions },
    { data: requisitions },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "company_name, japan_team_size, japan_role_in_group, years_in_japan, employee_japanese_pct, strategy_notes, is_active, contract_signed, fee_pct, kk_entity, ai_context",
      )
      .eq("id", entityId)
      .single(),
    supabase
      .from("client_contacts")
      .select("name, title, role, relationship_score, notes, is_primary")
      .eq("client_id", entityId),
    supabase
      .from("interactions")
      .select("interaction_type, summary, full_notes, interacted_at, direction")
      .eq("client_id", entityId)
      .order("interacted_at", { ascending: false })
      .limit(30),
    supabase
      .from("requisitions")
      .select("title, salary_range_text, salary_min, salary_max, location, urgency_date, is_open, ai_context, processes ( stage, candidates ( full_name ) )")
      .eq("client_id", entityId),
  ]);

  if (!client) throw new Error("Client not found");

  const cl = client as {
    company_name: string;
    japan_team_size: number | null;
    japan_role_in_group: string | null;
    years_in_japan: number | null;
    employee_japanese_pct: number | null;
    strategy_notes: string | null;
    is_active: boolean;
    contract_signed: boolean;
    fee_pct: number | null;
    kk_entity: string | null;
    ai_context: string | null;
  };

  type ReqRow = {
    title: string;
    salary_range_text: string | null;
    salary_min: number | null;
    salary_max: number | null;
    location: string | null;
    urgency_date: string | null;
    is_open: boolean;
    ai_context: string | null;
    processes: Array<{ stage: string; candidates: { full_name: string } | null }> | null;
  };
  const reqs = (requisitions ?? []) as unknown as ReqRow[];

  const requisitionsText = reqs.length === 0
    ? "No requisitions on file for this client."
    : reqs
        .map((r) => {
          const pipeline = (r.processes ?? [])
            .map((p) => `${p.candidates?.full_name ?? "Unknown candidate"} (${p.stage})`)
            .join(", ") || "No candidates in pipeline.";
          return `- ${r.title} [${r.is_open ? "OPEN" : "CLOSED"}] — ${r.salary_range_text ?? `${formatYen(r.salary_min)}–${formatYen(r.salary_max)}`}${r.location ? `, ${r.location}` : ""}${r.urgency_date ? `, target close ${r.urgency_date}` : ""}
  Pipeline: ${pipeline}
${r.ai_context ? `  Requisition context: ${r.ai_context}` : "  No reconciled requisition context on file yet."}`;
        })
        .join("\n\n");

  const prompt = `
HANDOFF PACK: CLIENT ACCOUNT — ${cl.company_name}${cl.is_active ? "" : " (INACTIVE)"}

Japan presence: ${cl.years_in_japan ?? "—"} years, team of ${cl.japan_team_size ?? "—"}, ${cl.employee_japanese_pct != null ? `${cl.employee_japanese_pct}% Japanese nationals` : "Japanese-national % unknown"}
Role in group: ${cl.japan_role_in_group ?? "—"} | KK entity: ${cl.kk_entity ?? "—"}
Contract: ${cl.contract_signed ? `Signed, ${cl.fee_pct != null ? `${cl.fee_pct}% fee` : "fee % unknown"}` : "Not signed"}

RECONCILED ACCOUNT MEMORY (most current understanding of this client):
${cl.ai_context ?? "No reconciled context on file yet — rely on the raw interaction history below."}

KEY CONTACTS:
${(contacts ?? []).map((c) => `- ${c.name}, ${c.title ?? c.role}${c.is_primary ? " (primary)" : ""}${c.relationship_score ? ` — relationship ${c.relationship_score}/5` : ""}${c.notes ? `\n  Recruiter notes: ${c.notes}` : ""}`).join("\n") || "None recorded."}

${cl.strategy_notes ? `Strategy notes: ${cl.strategy_notes}` : ""}

REQUISITIONS AND PIPELINE:
${requisitionsText}

RAW INTERACTION HISTORY (recency-weighted, most recent first):
${interactionLines(interactions).join("\n") || "No interactions logged."}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3000,
    thinking: { type: "disabled" },
    system: HANDOFF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content.find((b) => b.type === "text")?.text ?? "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { entity_type, entity_id } = req.body as {
    entity_type: "candidate" | "client";
    entity_id: string;
  };
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: "entity_type and entity_id are required" });
  }

  try {
    const content = entity_type === "candidate"
      ? await buildCandidateHandoff(entity_id)
      : await buildClientHandoff(entity_id);
    return res.status(200).json({ content });
  } catch {
    return res.status(200).json({ error: "Could not generate handoff pack. Try again." });
  }
}
