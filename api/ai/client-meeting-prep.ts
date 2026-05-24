import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { clientId, recruiterId } = req.body as {
    clientId: string;
    recruiterId: string;
  };

  if (!clientId || !recruiterId) {
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
      .select("company_name, strategy_notes, japan_role_in_group, fee_pct")
      .eq("id", clientId)
      .single(),
    supabase
      .from("client_contacts")
      .select("name, role, relationship_score, notes")
      .eq("client_id", clientId)
      .order("created_at"),
    supabase
      .from("requisitions")
      .select(
        `id, title, is_open, urgency,
         processes (
           id, stage, updated_at,
           candidates ( full_name, current_title )
         )`,
      )
      .eq("client_id", clientId)
      .eq("recruiter_id", recruiterId)
      .order("created_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("interaction_type, summary, interacted_at")
      .eq("client_id", clientId)
      .order("interacted_at", { ascending: false })
      .limit(5),
  ]);

  if (!rawClient) return res.status(404).json({ error: "Client not found" });

  const client = rawClient as {
    company_name: string;
    strategy_notes: string | null;
    japan_role_in_group: string | null;
    fee_pct: number | null;
  };

  const contacts = (rawContacts ?? []) as Array<{
    name: string;
    role: string;
    relationship_score: number | null;
    notes: string | null;
  }>;

  const reqs = (rawReqs ?? []) as Array<{
    id: string;
    title: string;
    is_open: boolean;
    urgency: string | null;
    processes: Array<{
      id: string;
      stage: string;
      updated_at: string;
      candidates: { full_name: string; current_title: string | null } | null;
    }>;
  }>;

  const interactions = (rawInteractions ?? []) as Array<{
    interaction_type: string;
    summary: string | null;
    interacted_at: string;
  }>;

  // Compute active pipeline snapshot
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
        daysInStage: daysSince(p.updated_at),
      })),
  );

  const feedbackOverdue = activePipeline.filter(
    (p) =>
      (p.stage === "CV Sent" && p.daysInStage >= 3) ||
      (/^CCM\d+$/.test(p.stage) && p.daysInStage >= 2),
  );

  const hm = contacts.find((c) => c.role === "hiring_manager");
  const hmScore = hm?.relationship_score ?? null;

  const prompt = `
Company: ${client.company_name}
${client.japan_role_in_group ? `Japan role in group: ${client.japan_role_in_group}` : ""}
${client.strategy_notes ? `Strategy notes: ${client.strategy_notes.slice(0, 400)}` : ""}

Key contacts:
${contacts.map((c) => `- ${c.name} (${c.role})${c.relationship_score ? ` — relationship score ${c.relationship_score}/5` : ""}${c.notes ? `: ${c.notes.slice(0, 100)}` : ""}`).join("\n")}

Open requisitions and active pipeline:
${openReqs.length === 0 ? "No open requisitions." : openReqs.map((r) => {
    const active = (r.processes ?? []).filter((p) => !["Placed", "Closed lost"].includes(p.stage));
    return `- ${r.title}${r.urgency ? ` [${r.urgency}]` : ""}: ${active.length === 0 ? "no candidates in pipeline" : active.map((p) => `${p.candidates?.full_name ?? "?"} at ${p.stage}`).join(", ")}`;
  }).join("\n")}

${feedbackOverdue.length > 0 ? `Feedback the client owes:\n${feedbackOverdue.map((p) => `- ${p.candidateName} (${p.reqTitle}) — ${p.stage}, ${p.daysInStage} days waiting`).join("\n")}` : "No overdue feedback."}

Recent interactions:
${interactions.length === 0 ? "No recent interactions logged." : interactions.map((i) => `- ${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString()}: ${i.summary ?? "no summary"}`).join("\n")}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    system: `You are preparing a pre-meeting brief for a recruiter going into a client meeting in Japan. The recruiter reads this in 90 seconds before the meeting. Make it scannable and immediately actionable.

Structure:
1. SITUATION (2 sentences): where things stand with this client right now — momentum, risks, relationship tone.
2. ACTIVE PIPELINE (bullets): one line per candidate in process. Format: [Name] — [Role] — [Stage] — [flag if action needed].
3. WHAT THE CLIENT OWES YOU (bullets): outstanding feedback requests. Be direct.
4. TALKING POINTS FOR THIS MEETING (2–3 points): what to raise, in what order. Include one relationship-building point if score is low.
5. WATCH OUT FOR (1 sentence): the single thing most likely to go wrong if not addressed today.

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. Write in clear English. No em dashes.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
