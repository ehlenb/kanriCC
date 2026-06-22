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

  const { clientId, requisitionId, recruiterId } = req.body as {
    clientId: string;
    requisitionId?: string;
    recruiterId: string;
  };

  // Also support snake_case keys from new callers
  const resolvedClientId = clientId ?? req.body.client_id;
  const resolvedReqId = requisitionId ?? req.body.requisition_id;

  if (!resolvedClientId || !recruiterId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [
    { data: rawClient },
    { data: rawContacts },
    { data: rawReqs },
    { data: rawInteractions },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("company_name, strategy_notes, japan_role_in_group, years_in_japan, employee_japanese_pct, fee_pct, ai_context, status")
      .eq("id", resolvedClientId)
      .single(),
    supabase
      .from("client_contacts")
      .select("name, role, relationship_score, notes, is_primary, title")
      .eq("client_id", resolvedClientId)
      .order("created_at"),
    supabase
      .from("requisitions")
      .select(
        `id, title, is_open, urgency,
         processes (
           id, stage, last_activity_at,
           candidates ( full_name, current_title )
         )`,
      )
      .eq("client_id", resolvedClientId)
      .eq("recruiter_id", recruiterId)
      .order("created_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("interaction_type, summary, full_notes, interacted_at")
      .eq("client_id", resolvedClientId)
      .order("interacted_at", { ascending: false })
      .limit(3),
  ]);

  if (!rawClient) return res.status(404).json({ error: "Client not found" });

  // Load requisition conditions if a specific req is provided
  let conditionsText = "";
  if (resolvedReqId) {
    const { data: conditions } = await supabase
      .from("requisition_conditions")
      .select("condition_text, condition_type, priority_rank")
      .eq("requisition_id", resolvedReqId)
      .order("priority_rank");

    if (conditions && conditions.length > 0) {
      const conds = conditions as Array<{ condition_text: string; condition_type: string; priority_rank: number }>;
      conditionsText = `\nKey conditions for this role:\n${conds.map((c) => `[${c.condition_type.toUpperCase()}] ${c.condition_text}`).join("\n")}`;
    }
  }

  const client = rawClient as {
    company_name: string;
    strategy_notes: string | null;
    japan_role_in_group: string | null;
    years_in_japan: number | null;
    employee_japanese_pct: number | null;
    fee_pct: number | null;
    ai_context: string | null;
    status: string;
  };

  const contacts = (rawContacts ?? []) as Array<{
    name: string;
    role: string;
    title: string | null;
    relationship_score: number | null;
    notes: string | null;
    is_primary: boolean;
  }>;

  const reqs = (rawReqs ?? []) as Array<{
    id: string;
    title: string;
    is_open: boolean;
    urgency: string | null;
    processes: Array<{
      id: string;
      stage: string;
      last_activity_at: string | null;
      candidates: { full_name: string; current_title: string | null } | null;
    }>;
  }>;

  const interactions = (rawInteractions ?? []) as Array<{
    interaction_type: string;
    summary: string | null;
    full_notes: string | null;
    interacted_at: string;
  }>;

  const now = Date.now();
  const daysSince = (iso: string) =>
    Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));

  const openReqs = reqs.filter((r) => r.is_open);
  const activePipeline = openReqs.flatMap((r) =>
    (r.processes ?? [])
      .filter((p) => !["Placed", "Closed lost"].includes(p.stage))
      .map((p) => ({
        candidateName: p.candidates?.full_name ?? "Unknown",
        stage: p.stage,
        reqTitle: r.title,
        daysInStage: p.last_activity_at ? daysSince(p.last_activity_at) : null,
      })),
  );

  const feedbackOverdue = activePipeline.filter(
    (p) =>
      (p.stage === "CV Sent" && (p.daysInStage ?? 0) >= 3) ||
      (/^CCM\d+$/.test(p.stage) && (p.daysInStage ?? 0) >= 2),
  );

  const prompt = `
Company: ${client.company_name} (${client.status})
${client.japan_role_in_group ? `Japan role in group: ${client.japan_role_in_group}` : ""}
${client.years_in_japan ? `Years in Japan: ${client.years_in_japan}` : ""}
${client.employee_japanese_pct != null ? `Japanese team %: ${client.employee_japanese_pct}%` : ""}
${client.strategy_notes ? `Strategy notes: ${client.strategy_notes.slice(0, 400)}` : ""}
${client.ai_context ? `Account intelligence:\n${client.ai_context.slice(0, 500)}` : ""}

Key contacts:
${contacts.map((c) => `- ${c.name} (${c.role}${c.title ? `, ${c.title}` : ""})${c.is_primary ? " [primary]" : ""}${c.relationship_score ? ` — relationship score ${c.relationship_score}/5` : ""}${c.notes ? `: ${c.notes.slice(0, 100)}` : ""}`).join("\n")}

Open requisitions and active pipeline:
${openReqs.length === 0 ? "No open requisitions." : openReqs.map((r) => {
  const active = (r.processes ?? []).filter((p) => !["Placed", "Closed lost"].includes(p.stage));
  return `- ${r.title}${r.urgency ? ` [${r.urgency}]` : ""}: ${active.length === 0 ? "no candidates in pipeline" : active.map((p) => `${p.candidates?.full_name ?? "?"} at ${p.stage}`).join(", ")}`;
}).join("\n")}

${feedbackOverdue.length > 0 ? `Feedback the client owes:\n${feedbackOverdue.map((p) => `- ${p.candidateName} (${p.reqTitle}) — ${p.stage}, ${p.daysInStage} days waiting`).join("\n")}` : ""}

Last 3 interactions:
${interactions.length === 0 ? "No recent interactions logged." : interactions.map((i) => `- ${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString()}: ${i.full_notes?.slice(0, 200) ?? i.summary ?? "no summary"}`).join("\n")}
${conditionsText}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 800,
    system: `You are preparing a pre-meeting brief for a recruiter going into a client meeting in Japan. The recruiter reads this in 90 seconds before the meeting.

Write in plain text. Use ALL CAPS section labels exactly as shown. No markdown.

WHAT YOU KNOW
[Current state of the relationship and any open work. 2-3 sentences.]

OPEN ITEMS
[Anything unresolved from the last interaction — feedback owed, commitments made, follow-up needed. Bullet list. Omit if none.]

SUGGESTED AGENDA
[3-4 points to cover. Specific to this client's situation. Bold lead phrase per point using **bold**.]

MARKET CONTEXT TO SHARE
[Japan market intelligence relevant to their open roles — bilingual talent scarcity, job-to-applicant ratio, realistic timelines, salary expectations. Only include if relevant to their current situation.]

OBJECTION PREP
[If expectation management is needed — specific talking points for managing client expectations. Omit if not relevant.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Clear English.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
