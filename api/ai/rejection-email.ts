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

  const { process_id, candidate_id } = req.body as { process_id: string; candidate_id: string };
  if (!process_id || !candidate_id) return res.status(400).json({ error: "Missing required fields" });

  const [{ data: candidate }, { data: process }] = await Promise.all([
    supabase
      .from("candidates")
      .select("full_name, notes_interview")
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("processes")
      .select("stage, ccm_feedback_notes, ccm_outcome, requisitions ( title, clients ( company_name ) )")
      .eq("id", process_id)
      .single(),
  ]);

  if (!candidate || !process) return res.status(404).json({ error: "Data not found" });

  const req_ = (process as { requisitions: unknown }).requisitions as {
    title: string;
    clients: { company_name: string } | null;
  } | null;

  const c = candidate as { full_name: string; notes_interview: string | null };
  const p = process as { stage: string; ccm_feedback_notes: string | null; ccm_outcome: string | null };

  const firstName = c.full_name.split(" ")[0];
  const role = req_?.title ?? "the role";
  const client = req_?.clients?.company_name ?? "the client";
  const feedbackContext = p.ccm_feedback_notes
    ? `Client feedback: ${p.ccm_feedback_notes}`
    : "Client did not proceed — no detailed feedback provided.";

  const prompt = `
Candidate: ${c.full_name} (use first name "${firstName}" in the email)
Role: ${role} at ${client}
Stage: ${p.stage}
${feedbackContext}

${c.notes_interview ? `Registration notes (for context on candidate's situation):\n${c.notes_interview.slice(0, 600)}` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: `You are writing a rejection email on behalf of a recruiter in Japan.

The email is from the recruiter to the candidate informing them that the client will not be proceeding.

Rules:
- Warm, professional, and brief. 3-4 short paragraphs maximum.
- Address the candidate by first name only.
- Do not reveal specific client feedback verbatim if it is negative — reframe it constructively.
- Acknowledge the candidate's effort and the time they invested.
- Leave the door open — the recruiter wants to continue working with this person on other roles.
- Do not fabricate reasons if no feedback was given — say the client moved in a different direction.
- Write as if from the recruiter, in first person (I, we).
- No subject line. No sign-off name — end with "Best regards" only.
- FORBIDDEN WORDS: straightforward, genuinely, honestly, leverage (as a verb), utilize.
- No em dashes. Plain, clear English. Short sentences.`,
    messages: [{ role: "user", content: prompt }],
  });

  const email = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ email });
}
