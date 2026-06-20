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

  const { process_id, scenario } = req.body as {
    process_id: string;
    scenario: "pass" | "reject" | "no_response";
  };

  if (!process_id || !scenario) return res.status(400).json({ error: "process_id and scenario are required" });

  const { data: proc } = await supabase
    .from("processes")
    .select(
      "stage, candidate_id, requisitions ( title, clients ( company_name ) ), candidates ( full_name, current_company, current_title, notes_interview, notes_pitch, notes_closing, expected_total_min, expected_total_max )",
    )
    .eq("id", process_id)
    .single();

  if (!proc) return res.status(404).json({ error: "Process not found" });

  const p = proc as {
    stage: string;
    candidate_id: string;
    requisitions: { title: string; clients: { company_name: string } | null } | null;
    candidates: {
      full_name: string;
      current_company: string | null;
      current_title: string | null;
      notes_interview: string | null;
      notes_pitch: string | null;
      notes_closing: string | null;
      expected_total_min: number | null;
      expected_total_max: number | null;
    } | null;
  };

  const clientName = p.requisitions?.clients?.company_name ?? "the client";
  const candidateName = p.candidates?.full_name ?? "the candidate";
  const firstName = candidateName.split(" ")[0];
  const roleTitle = p.requisitions?.title ?? "the role";
  const stage = p.stage;
  const nextCcm = stage.replace(/CCM(\d+)/, (_, n) => `CCM${parseInt(n) + 1}`);
  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const [{ data: candidateInteractions }, { data: competing }, { data: motivations }] = await Promise.all([
    supabase
      .from("interactions")
      .select("summary, full_notes, interaction_type, interacted_at")
      .eq("candidate_id", p.candidate_id)
      .order("interacted_at", { ascending: false })
      .limit(4),
    supabase
      .from("competing_interviews")
      .select("company_name, stage")
      .eq("candidate_id", p.candidate_id)
      .eq("is_active", true),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text")
      .eq("candidate_id", p.candidate_id)
      .order("rank"),
  ]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const activityText = (candidateInteractions ?? [])
    .map(
      (i: { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null }) =>
        `- ${i.interaction_type} on ${fmtDate(i.interacted_at)}: ${i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes"}`,
    )
    .join("\n") || "No recent interactions.";

  const competingText =
    (competing ?? [])
      .map((c: { company_name: string; stage: string | null }) => `- ${c.company_name}${c.stage ? ` (${c.stage})` : ""}`)
      .join("\n") || "None disclosed.";

  const motivationText = (motivations ?? [])
    .map((m: { rank: number; motivation_text: string }) => `${m.rank}. ${m.motivation_text}`)
    .join("\n");

  const baseContext = `
Candidate: ${candidateName}, ${p.candidates?.current_title ?? "—"} at ${p.candidates?.current_company ?? "—"}
Role: ${roleTitle} at ${clientName} (${stage})
Target comp: ${formatYen(p.candidates?.expected_total_min)}–${formatYen(p.candidates?.expected_total_max)}

${motivationText ? `Motivations (ranked):\n${motivationText}` : ""}
${p.candidates?.notes_interview ? `Interview notes:\n${p.candidates.notes_interview.slice(0, 800)}` : ""}
${p.candidates?.notes_pitch ? `Pitch notes: ${p.candidates.notes_pitch.slice(0, 300)}` : ""}
${p.candidates?.notes_closing ? `Closing intelligence: ${p.candidates.notes_closing.slice(0, 300)}` : ""}

Competing processes:
${competingText}

Recent candidate activity:
${activityText}
`.trim();

  let systemPrompt = "";
  let userPrompt = "";

  if (scenario === "pass") {
    systemPrompt = `You are writing a call brief for a recruiter who just received positive ${stage} feedback from ${clientName} on ${candidateName}. The next step is to call ${firstName} to share the news, gauge where they stand on all their processes, reinforce the ${clientName} opportunity, and prepare them for ${nextCcm}.

Write in plain text. ALL CAPS section labels. No markdown.

OPENING
[One sentence to open the call — share the good news naturally.]

GAUGE THEIR POSITION
[2-3 specific questions to ask about where they stand across all their competing processes. Reference the actual competing companies by name. You need to know if they are close to an offer elsewhere before scheduling the next round.]

REINFORCE THE OPPORTUNITY
[2-3 points tied to this candidate's ranked motivations. Why ${clientName} is the right move for them specifically. Bold lead phrase with **bold**. One sentence each. No generic points.]

NEXT STEPS TO CONFIRM ON THE CALL
[What to agree before hanging up — ${nextCcm} scheduling, any prep they need, timeline alignment. 2-3 bullet points.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`;

    userPrompt = baseContext;
  } else if (scenario === "reject") {
    systemPrompt = `You are writing a script and email draft for a recruiter who received a rejection from ${clientName} after ${stage} for ${candidateName}. The goal is to deliver the news softly, maintain the relationship, and keep the candidate engaged for future opportunities.

Write in plain text. ALL CAPS section labels. No markdown.

CALL SCRIPT — HOW TO OPEN
[2-3 sentences on how to open this difficult call. Acknowledge their effort. Do not lead with the rejection.]

WHAT TO SAY
[The rejection message itself — 3-4 sentences. Soft, professional, candidate-first. Include the feedback framing without making it feel final. Use what you know about the client's concern if any is evident from the notes.]

HOW TO KEEP THEM ENGAGED
[1-2 sentences on what to offer next — other roles you are working on, staying in touch, next check-in timing.]

EMAIL DRAFT — SUBJECT LINE
[One subject line for a follow-up email.]

EMAIL DRAFT — BODY
[A short, warm rejection email in recruiter voice. 4-6 sentences. Copy-paste ready. Do not use the word "unfortunately".]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`;

    userPrompt = baseContext;
  } else {
    // no_response
    systemPrompt = `You are writing a candidate warm email for a recruiter who is waiting for ${stage} feedback from ${clientName} on ${candidateName}. The client has not responded yet. The recruiter needs to keep ${firstName} warm and engaged while they wait, without revealing that the client is slow.

Write in plain text. ALL CAPS section labels. No markdown.

SITUATION ASSESSMENT
[1-2 sentences on how to frame this internally — is there urgency given competing processes? What is the risk of going quiet?]

EMAIL DRAFT — SUBJECT LINE
[One natural subject line. Not "Checking in" or "Following up".]

EMAIL DRAFT — BODY
[A short warm email to ${firstName} — 4-5 sentences. Reference something specific from their recent conversations or the process. Keep energy positive. Do not say feedback is pending. Copy-paste ready.]

IF YOU NEED TO FOLLOW UP WITH THE CLIENT TOO
[One sentence on how to nudge ${clientName} without being aggressive — referencing the candidate's timeline or competing processes if relevant.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`;

    userPrompt = baseContext;
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 700,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
