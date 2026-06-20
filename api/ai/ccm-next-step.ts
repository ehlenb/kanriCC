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

Use markdown: **bold** for headers and key phrases, • for bullets. Short, clear English. No preamble.

**How to open**
[One sentence — share the good news naturally.]

**Gauge their position**
[2–3 specific questions about where they stand across all competing processes. Name the actual companies. You need to know if they are close to an offer elsewhere before scheduling ${nextCcm}.]

**Reinforce the opportunity**
[2–3 bullets tied to this candidate's ranked motivations. Why ${clientName} specifically. **Bold** the key phrase in each. No generic points.]

**Before you hang up**
[What to confirm — ${nextCcm} scheduling, any prep needed, timeline. 2–3 bullets.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`;

    userPrompt = baseContext;
  } else if (scenario === "reject") {
    systemPrompt = `You are writing a call script and email draft for a recruiter who received a rejection from ${clientName} after ${stage} for ${candidateName}. Goal: deliver the news softly, maintain the relationship, keep the candidate engaged.

Use markdown: **bold** for headers and key phrases, • for bullets. Short, clear English. No preamble.

**How to open the call**
[2–3 sentences. Acknowledge their effort. Do not lead with the rejection.]

**How to frame the news**
[3–4 sentences. Soft, professional, candidate-first. Where possible, frame the feedback constructively without making it feel final.]

**Keep them engaged**
[1–2 sentences on what you offer next — other searches, timing for next contact.]

**Email — subject line**
[One subject line.]

**Email — body**
[Short, warm rejection email in recruiter voice. 4–5 sentences. Copy-paste ready. Do not use the word "unfortunately".]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`;

    userPrompt = baseContext;
  } else {
    // no_response
    systemPrompt = `You are writing a candidate-warm email for a recruiter waiting for ${stage} feedback from ${clientName} on ${candidateName}. The client has not responded. Keep ${firstName} warm and engaged without revealing the client is slow.

Use markdown: **bold** for headers and key phrases, • for bullets. Short, clear English. No preamble.

**Read the situation**
[1–2 sentences on internal framing — urgency given competing processes, risk of going quiet.]

**Email — subject line**
[One natural subject line. Not "Checking in" or "Following up".]

**Email — body**
[4–5 sentences to ${firstName}. Reference something specific from recent conversations or the process. Keep energy positive. Do not mention that feedback is pending. Copy-paste ready.]

**Nudging the client (if needed)**
[One sentence on how to follow up with ${clientName} without being aggressive — use the candidate's competing timeline as natural context.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`;

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
