import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { entity_type, entity_id, process_id } = req.body as {
    entity_type: "candidate" | "client";
    entity_id: string;
    process_id?: string;
    // Legacy support
    candidateId?: string;
    recruiterId?: string;
  };

  // Legacy field fallback
  const resolvedEntityType = entity_type ?? "candidate";
  const resolvedEntityId = entity_id ?? req.body.candidateId;

  if (!resolvedEntityId) {
    return res.status(400).json({ error: "entity_id is required" });
  }

  const formatYen = (n: number | null) =>
    n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";

  if (resolvedEntityType === "candidate") {
    const [
      { data: candidate },
      { data: motivations },
      { data: blockers },
      { data: roles },
      { data: competing },
      { data: recentInteractions },
    ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "full_name, current_company, current_title, japanese_level, english_level, candidate_status, notice_period_months, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_interview, notes_personality, notes_pitch, notes_closing, ai_context",
        )
        .eq("id", resolvedEntityId)
        .single(),
      supabase
        .from("candidate_motivations")
        .select("rank, motivation_text, motivation_type")
        .eq("candidate_id", resolvedEntityId)
        .order("rank"),
      supabase
        .from("candidate_blockers")
        .select("is_risk, theme, detail")
        .eq("candidate_id", resolvedEntityId)
        .eq("is_risk", true),
      supabase
        .from("candidate_roles")
        .select("company_name, title, is_current, achievement_notes")
        .eq("candidate_id", resolvedEntityId)
        .order("start_date", { ascending: false })
        .limit(2),
      supabase
        .from("competing_interviews")
        .select("company_name, stage")
        .eq("candidate_id", resolvedEntityId)
        .eq("is_active", true),
      supabase
        .from("interactions")
        .select("summary, full_notes, interaction_type, interacted_at")
        .eq("candidate_id", resolvedEntityId)
        .order("interacted_at", { ascending: false })
        .limit(3),
    ]);

    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    const c = candidate as {
      full_name: string;
      current_company: string | null;
      current_title: string | null;
      japanese_level: string | null;
      english_level: string | null;
      candidate_status: string;
      notice_period_months: number | null;
      current_total: number | null;
      expected_total_min: number | null;
      expected_total_max: number | null;
      base_is_priority: boolean;
      base_minimum: number | null;
      notes_interview: string | null;
      notes_personality: string | null;
      notes_pitch: string | null;
      notes_closing: string | null;
      ai_context: string | null;
    };

    // Optional: load process context if provided
    let processContext = "";
    if (process_id) {
      const { data: proc } = await supabase
        .from("processes")
        .select(
          "stage, requisitions ( title, requisition_conditions ( condition_text, condition_type, priority_rank ) )",
        )
        .eq("id", process_id)
        .single();

      if (proc) {
        const p = proc as {
          stage: string;
          requisitions: {
            title: string;
            requisition_conditions: Array<{ condition_text: string; condition_type: string; priority_rank: number }>;
          } | null;
        };
        const mustHave = (p.requisitions?.requisition_conditions ?? [])
          .filter((c) => c.condition_type === "must_have")
          .map((c) => `- ${c.condition_text}`)
          .join("\n");
        processContext = `\nActive process: ${p.requisitions?.title ?? "—"} (${p.stage})\n${mustHave ? `Must-have conditions:\n${mustHave}` : ""}`;
      }
    }

    const prompt = `
Candidate: ${c.full_name}
Status: ${c.candidate_status}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Notice: ${c.notice_period_months ?? "—"} months
Compensation: Current ${formatYen(c.current_total)}, target ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}

${c.notes_interview ? `REGISTRATION INTERVIEW NOTES (primary knowledge base — may be superseded by more recent activity below):
${c.notes_interview.slice(0, 1200)}` : ""}

${c.ai_context ? `Intelligence summary:\n${c.ai_context.slice(0, 400)}` : ""}

${(motivations ?? []).length > 0 ? `Recorded motivations:\n${(motivations ?? []).map((m: { rank: number; motivation_type: string | null; motivation_text: string }) => `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`).join("\n")}` : ""}

${(blockers ?? []).length > 0 ? `Active risks:\n${(blockers ?? []).map((b: { theme: string; detail: string | null }) => `- ${b.theme}: ${b.detail ?? ""}`).join("\n")}` : ""}

Active competing interviews:
${(competing ?? []).map((ci: { company_name: string; stage: string | null }) => `- ${ci.company_name}${ci.stage ? ` (${ci.stage})` : ""}`).join("\n") || "None disclosed."}

Recent roles:
${(roles ?? []).map((r: { company_name: string; title: string | null; is_current: boolean; achievement_notes: string | null }) => `- ${r.company_name}${r.is_current ? " (current)" : ""}: ${r.title ?? "—"}. ${r.achievement_notes?.slice(0, 200) ?? ""}`).join("\n")}

RECENT ACTIVITY (most recent first — treat as fresher intelligence):
${(recentInteractions ?? []).map((i: { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null }) => `- ${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}: ${i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes"}`).join("\n") || "No interactions logged yet."}

${c.notes_pitch ? `Pitch notes: ${c.notes_pitch.slice(0, 200)}` : ""}
${c.notes_personality ? `Personality: ${c.notes_personality.slice(0, 200)}` : ""}
${c.notes_closing ? `Closing intelligence: ${c.notes_closing.slice(0, 200)}` : ""}
${processContext}
`.trim();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 700,
      system: `You are preparing a pre-call briefing for a recruiter in Japan. The recruiter reads this in 60 seconds before the call.

Write in plain text. Use ALL CAPS section labels exactly as shown. No markdown.

CURRENT SITUATION
[2-3 sentences on where things stand right now with this candidate.]

WHAT TO COVER
[3-4 specific points based on stage and context. Bold lead phrase per point using **bold**. One sentence each.]

WATCH-OUTS
[Active risks only — competing interviews, blockers, compensation risks. Bold lead phrase per point. If none, omit this section entirely.]

SUGGESTED OPENING
[One natural opening sentence or question. Not a script — a starting point.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0].type === "text" ? message.content[0].text : "";
    return res.status(200).json({ content });
  }

  // Client briefing
  const [{ data: client }, { data: contacts }, { data: openReqs }, { data: recentInteractions }] =
    await Promise.all([
      supabase
        .from("clients")
        .select(
          "company_name, industry, japan_team_size, japan_role_in_group, years_in_japan, employee_japanese_pct, strategy_notes, status, ai_context",
        )
        .eq("id", resolvedEntityId)
        .single(),
      supabase
        .from("client_contacts")
        .select("name, title, role, relationship_score, is_primary")
        .eq("client_id", resolvedEntityId),
      supabase
        .from("requisitions")
        .select("title, is_open, processes ( stage, candidates ( full_name ) )")
        .eq("client_id", resolvedEntityId)
        .eq("is_open", true),
      supabase
        .from("interactions")
        .select("interaction_type, summary, full_notes, interacted_at")
        .eq("client_id", resolvedEntityId)
        .order("interacted_at", { ascending: false })
        .limit(3),
    ]);

  if (!client) return res.status(404).json({ error: "Client not found" });

  const cl = client as {
    company_name: string;
    industry: string | null;
    japan_team_size: string | null;
    japan_role_in_group: string | null;
    years_in_japan: number | null;
    employee_japanese_pct: number | null;
    strategy_notes: string | null;
    status: string;
    ai_context: string | null;
  };

  const prompt = `
Company: ${cl.company_name} (${cl.status})
${cl.japan_role_in_group ? `Japan role: ${cl.japan_role_in_group}` : ""}
${cl.years_in_japan ? `Years in Japan: ${cl.years_in_japan}` : ""}
${cl.employee_japanese_pct != null ? `Japanese team %: ${cl.employee_japanese_pct}%` : ""}

${cl.ai_context ? `Account intelligence:\n${cl.ai_context.slice(0, 600)}` : ""}

Contacts:
${(contacts ?? []).map((c: { name: string; title: string | null; role: string; relationship_score: number | null; is_primary: boolean }) => `- ${c.name}, ${c.title ?? c.role}${c.is_primary ? " (primary)" : ""}${c.relationship_score ? ` — relationship ${c.relationship_score}/5` : ""}`).join("\n")}

Open requisitions:
${(openReqs ?? []).map((r: { title: string; processes: Array<{ stage: string; candidates: { full_name: string } | null }> }) => {
  const active = (r.processes ?? []).filter((p) => !["Placed", "Closed lost"].includes(p.stage));
  return `- ${r.title}: ${active.length === 0 ? "no candidates" : active.map((p) => `${p.candidates?.full_name ?? "?"} at ${p.stage}`).join(", ")}`;
}).join("\n") || "No open requisitions."}

Last 3 interactions:
${(recentInteractions ?? []).map((i: { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null }) => `- ${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString()}: ${i.full_notes?.slice(0, 200) ?? i.summary ?? "No notes"}`).join("\n")}

${cl.strategy_notes ? `Strategy notes: ${cl.strategy_notes.slice(0, 300)}` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 700,
    system: `You are preparing a pre-call briefing for a recruiter in Japan calling a client. The recruiter reads this in 60 seconds before the call.

Write in plain text. Use ALL CAPS section labels exactly as shown. No markdown.

CURRENT SITUATION
[2-3 sentences on where things stand with this client right now.]

WHAT TO COVER
[3-4 specific points. Bold lead phrase per point using **bold**. One sentence each.]

WATCH-OUTS
[Risks or open items that could go wrong. Bold lead phrase. If none, omit this section entirely.]

SUGGESTED OPENING
[One natural opening sentence or question. Not a script — a starting point.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
