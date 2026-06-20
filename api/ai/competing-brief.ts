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

  const { candidate_id, process_id, competing } = req.body as {
    candidate_id: string;
    process_id?: string;
    competing: { company_name: string; stage: string | null }[];
  };

  if (!candidate_id) return res.status(400).json({ error: "candidate_id is required" });

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const [
    { data: candidate },
    { data: motivations },
    { data: recentInteractions },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, current_company, current_title, japanese_level, english_level, notice_period_months, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_interview, notes_pitch, notes_closing",
      )
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text, motivation_type")
      .eq("candidate_id", candidate_id)
      .order("rank"),
    supabase
      .from("interactions")
      .select("summary, full_notes, interaction_type, interacted_at")
      .eq("candidate_id", candidate_id)
      .order("interacted_at", { ascending: false })
      .limit(5),
  ]);

  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const c = candidate as {
    full_name: string;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    notice_period_months: number | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean;
    base_minimum: number | null;
    notes_interview: string | null;
    notes_pitch: string | null;
    notes_closing: string | null;
  };

  // Load the requisition/client context from the active process
  let roleContext = "";
  let clientName = "";
  if (process_id) {
    const { data: proc } = await supabase
      .from("processes")
      .select("stage, requisitions ( title, salary_min, salary_max, salary_range_text, strategic_context, clients ( company_name, japan_team_size, japan_role_in_group, years_in_japan, strategy_notes ) )")
      .eq("id", process_id)
      .single();

    if (proc) {
      const p = proc as {
        stage: string;
        requisitions: {
          title: string;
          salary_min: number | null;
          salary_max: number | null;
          salary_range_text: string | null;
          strategic_context: string | null;
          clients: {
            company_name: string;
            japan_team_size: number | null;
            japan_role_in_group: string | null;
            years_in_japan: number | null;
            strategy_notes: string | null;
          } | null;
        } | null;
      };
      const req = p.requisitions;
      const cli = req?.clients;
      clientName = cli?.company_name ?? "";
      const salary = req?.salary_range_text
        ? req.salary_range_text
        : req?.salary_min && req?.salary_max
          ? `${formatYen(req.salary_min)}–${formatYen(req.salary_max)}`
          : "—";

      roleContext = `
Our role: ${req?.title ?? "—"} at ${clientName} (${p.stage})
Salary on offer: ${salary}
${cli?.japan_team_size ? `Japan team size: ${cli.japan_team_size}` : ""}
${cli?.japan_role_in_group ? `Japan role in group: ${cli.japan_role_in_group}` : ""}
${cli?.years_in_japan ? `Years in Japan: ${cli.years_in_japan}` : ""}
${cli?.strategy_notes ? `Client strategy: ${cli.strategy_notes.slice(0, 300)}` : ""}
${req?.strategic_context ? `Role context: ${req.strategic_context.slice(0, 300)}` : ""}`.trim();
    }
  }

  const competingText = competing
    .map((c) => `- ${c.company_name}${c.stage ? ` (${c.stage})` : ""}`)
    .join("\n");

  const motivationText = (motivations ?? [])
    .map((m: { rank: number; motivation_type: string | null; motivation_text: string }) =>
      `${m.rank}. ${m.motivation_type ? `[${m.motivation_type}] ` : ""}${m.motivation_text}`)
    .join("\n");

  const interactionText = (recentInteractions ?? [])
    .map((i: { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null }) =>
      `- ${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}: ${i.full_notes?.slice(0, 400) ?? i.summary ?? "No notes"}`)
    .join("\n");

  const prompt = `
Candidate: ${c.full_name}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Compensation: Current ${formatYen(c.current_total)}, target ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}

${roleContext}

Competing processes the candidate has disclosed:
${competingText || "None on record."}

${motivationText ? `Candidate motivations (ranked):\n${motivationText}` : ""}

${c.notes_interview ? `Interview notes:\n${c.notes_interview.slice(0, 1200)}` : ""}
${c.notes_pitch ? `Pitch notes: ${c.notes_pitch.slice(0, 300)}` : ""}
${c.notes_closing ? `Closing intelligence: ${c.notes_closing.slice(0, 300)}` : ""}

Recent activity (most recent first):
${interactionText || "No interactions logged yet."}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 700,
    system: `You are preparing a competitive positioning brief for a recruiter. The candidate has active competing interviews. The recruiter needs to call the candidate and reinforce their process at ${clientName || "our client"}.

Write in plain text. Use ALL CAPS section labels. No markdown.

SITUATION
[2 sentences max. Where this candidate stands right now and what the competing risk is.]

WHY ${clientName.toUpperCase() || "OUR ROLE"} WINS ON THEIR TERMS
[3 bullets. Each must tie directly to one of the candidate's stated motivations. Do not write generic points. Use what you know about the candidate and what you know about the competing company — if the competitor is a large domestic company, factor in promotion by seniority, less flexibility, etc. If the competitor is another foreign company, focus on role scope and comp. Bold the lead phrase with **bold**. One sentence each.]

WHAT TO WATCH
[Any competing process that is ahead of ours or at a critical stage. One sentence per risk. If none are ahead, omit.]

SUGGESTED OPENING
[One natural opening line that feels like a recruiter calling to check in — not a script, a starting point.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
