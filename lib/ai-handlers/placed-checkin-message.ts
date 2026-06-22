import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type MilestoneType = "day_1" | "two_week" | "one_month" | "three_month" | "long_term";
type MessageFormat = "email" | "linkedin" | "short";

const milestoneContext: Record<MilestoneType, string> = {
  day_1: "Today is their first day at the new company. This message is a warm congratulation — celebratory, personal, brief. The recruiter is genuinely happy for them. No agenda.",
  two_week: "Two weeks into the new role. The candidate is still settling in. This is a check-in to make sure things are going well and the recruiter is there if anything comes up. Warm and supportive.",
  one_month: "One month in. They should have a clearer picture of the team and role by now. A genuine catch-up — how are they finding it? Any surprises? The recruiter is interested, not checking a box.",
  three_month: "Three months in — end of the guarantee window. This is a meaningful milestone. The recruiter acknowledges it, wishes them well, and keeps the relationship warm for the long term.",
  long_term: "The candidate is around the 18-24 month mark post-placement, the window when many professionals in Japan start quietly thinking about their next move. The recruiter is not asking if they want to move. They are simply checking in at a natural moment. Casual, warm, brief, no agenda. If the candidate brings up work, great. If not, that is fine too.",
};

const formatContext: Record<MessageFormat, string> = {
  email: "Write a short email. Subject line first (no 'Subject:' prefix — just the line itself), then a blank line, then the message body. 3–5 sentences. Professional but warm.",
  linkedin: "Write a LinkedIn message. No greeting formalities — jump straight into it. 2–3 sentences. Conversational and genuine.",
  short: "Write a short message (WhatsApp/Line style). 1–2 sentences. Warm, casual, like a message from someone who genuinely cares. No formality.",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { process_id, milestone, format } = req.body as {
    process_id: string;
    milestone: MilestoneType;
    format: MessageFormat;
  };

  if (!process_id || !milestone || !format) {
    return res.status(400).json({ error: "process_id, milestone, and format are required" });
  }

  const { data: processData } = await supabase
    .from("processes")
    .select(
      "start_date, placed_date, candidate_id, candidates ( full_name, full_name_japanese, current_title ), requisitions ( title, clients ( company_name ) )",
    )
    .eq("id", process_id)
    .single();

  if (!processData) return res.status(404).json({ error: "Process not found" });

  const proc = processData as {
    start_date: string | null;
    placed_date: string | null;
    candidate_id: string;
    candidates: {
      full_name: string;
      full_name_japanese: string | null;
      current_title: string | null;
    } | null;
    requisitions: {
      title: string;
      clients: { company_name: string } | null;
    } | null;
  };

  const { data: lastInteraction } = await supabase
    .from("interactions")
    .select("summary, interacted_at")
    .eq("candidate_id", proc.candidate_id)
    .order("interacted_at", { ascending: false })
    .limit(1)
    .single();

  const cand = proc.candidates;
  const req_ = proc.requisitions;
  const firstName = cand?.full_name?.split(" ")[0] ?? "them";
  const companyName = req_?.clients?.company_name ?? "their new company";
  const roleTitle = req_?.title ?? "their new role";
  const startDate = proc.start_date
    ? new Date(proc.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const prompt = `
Candidate: ${cand?.full_name ?? "Unknown"}${cand?.full_name_japanese ? ` (${cand.full_name_japanese})` : ""}
First name: ${firstName}
New company: ${companyName}
New role: ${roleTitle}
${startDate ? `Start date: ${startDate}` : ""}
${lastInteraction ? `Last interaction: ${new Date(lastInteraction.interacted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} — ${lastInteraction.summary ?? "no summary"}` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    system: `You are helping a Japan-based recruiter write a check-in message to a candidate they placed.

Milestone context: ${milestoneContext[milestone]}

Format: ${formatContext[format]}

Rules:
- Write from the recruiter's perspective in first person. Do not include a sign-off name — the recruiter will add their own.
- Use the candidate's first name naturally. Do not use "-san" suffix unless the format is Japanese.
- Keep it genuine. This is a real relationship, not a process. The recruiter cares about how this person is doing.
- No agenda, no upsell, no mention of future job opportunities (except for long_term milestone where a gentle "if anything ever changes" framing is fine).
- NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0]?.type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
