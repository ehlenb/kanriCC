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

  const { process_id } = req.body as { process_id: string };
  if (!process_id) return res.status(400).json({ error: "process_id is required" });

  const { data: proc } = await supabase
    .from("processes")
    .select(
      "stage, candidate_id, requisitions ( title, clients ( id, company_name ) ), candidates ( full_name, current_company, current_title, notes_interview, notes_pitch )",
    )
    .eq("id", process_id)
    .single();

  if (!proc) return res.status(404).json({ error: "Process not found" });

  const p = proc as {
    stage: string;
    candidate_id: string;
    requisitions: { title: string; clients: { id: string; company_name: string } | null } | null;
    candidates: {
      full_name: string;
      current_company: string | null;
      current_title: string | null;
      notes_interview: string | null;
      notes_pitch: string | null;
    } | null;
  };

  const clientId = p.requisitions?.clients?.id;
  const clientName = p.requisitions?.clients?.company_name ?? "the client";
  const candidateName = p.candidates?.full_name ?? "the candidate";
  const firstName = candidateName.split(" ")[0];
  const roleTitle = p.requisitions?.title ?? "the role";
  const stage = p.stage;

  const [{ data: contacts }, { data: clientInteractions }, { data: candidateInteractions }, { data: competing }] =
    await Promise.all([
      supabase
        .from("client_contacts")
        .select("name, title, role, relationship_score, is_primary")
        .eq("client_id", clientId ?? ""),
      supabase
        .from("interactions")
        .select("summary, full_notes, interaction_type, interacted_at, contact_id")
        .eq("client_id", clientId ?? "")
        .order("interacted_at", { ascending: false })
        .limit(4),
      supabase
        .from("interactions")
        .select("summary, full_notes, interaction_type, interacted_at")
        .eq("candidate_id", p.candidate_id)
        .order("interacted_at", { ascending: false })
        .limit(3),
      supabase
        .from("competing_interviews")
        .select("company_name, stage")
        .eq("candidate_id", p.candidate_id)
        .eq("is_active", true),
    ]);

  const primaryContact = (contacts ?? []).find(
    (c: { is_primary: boolean }) => c.is_primary,
  ) ?? (contacts ?? [])[0];

  const contactName = (primaryContact as { name?: string } | undefined)?.name ?? "your contact";

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const clientActivityText = (clientInteractions ?? [])
    .map(
      (i: { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null }) =>
        `- ${i.interaction_type} on ${fmtDate(i.interacted_at)}: ${i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes"}`,
    )
    .join("\n") || "No recent client interactions logged.";

  const candidateActivityText = (candidateInteractions ?? [])
    .map(
      (i: { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null }) =>
        `- ${i.interaction_type} on ${fmtDate(i.interacted_at)}: ${i.summary ?? "No notes"}`,
    )
    .join("\n") || "No recent candidate interactions.";

  const competingText =
    (competing ?? [])
      .map((c: { company_name: string; stage: string | null }) => `- ${c.company_name}${c.stage ? ` (${c.stage})` : ""}`)
      .join("\n") || "None disclosed.";

  const notesInterview = p.candidates?.notes_interview?.slice(0, 600) ?? "";
  const notesPitch = p.candidates?.notes_pitch?.slice(0, 200) ?? "";

  const prompt = `
You are a recruiter preparing to call ${clientName} to chase ${stage} interview feedback on ${candidateName}.

PROCESS CONTEXT
Role: ${roleTitle} at ${clientName} (${stage})
Primary contact: ${contactName}
Candidate: ${candidateName}, ${p.candidates?.current_title ?? "—"} at ${p.candidates?.current_company ?? "—"}

CANDIDATE STRENGTHS (use to remind the client why they were excited)
${notesInterview || notesPitch || "No notes on file."}

CANDIDATE URGENCY
Competing processes:
${competingText}

RECENT CLIENT INTERACTIONS
${clientActivityText}

RECENT CANDIDATE UPDATES
${candidateActivityText}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    system: `You are writing a call brief for a recruiter who is about to call ${clientName} to chase ${stage} feedback on ${candidateName}. This is a client-facing call, not a candidate call.

Write in plain text. ALL CAPS section labels. No markdown.

WHAT YOU ARE CHASING
[One sentence on what you need from this call — specific feedback stage and candidate name.]

REMINDER POINTS FOR THE CLIENT
[2-3 bullets on why they were excited about this candidate. Pull from the recruiter's notes. Bold the lead phrase with **bold**. Be specific — no generic phrases.]

WHY TIMING MATTERS
[1-2 sentences on candidate urgency. If there are competing processes, name them and say what stage they are at. Be direct.]

SUGGESTED OPENING
[One natural sentence to open the call — referencing the interview that happened and asking for feedback. Not a script, a starting point.]

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short, clear English.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
