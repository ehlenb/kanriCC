import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type DraftType =
  | "follow_up"
  | "prep"
  | "closing"
  | "scheduling"
  | "report"
  | "hr_intro";

const FORBIDDEN =
  "NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Write in clear English suitable for non-native speakers.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { draftType, processId, clientId, recruiterId } = req.body as {
    draftType: DraftType;
    processId?: string;
    clientId: string;
    recruiterId: string;
  };

  if (!draftType || !clientId || !recruiterId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // ── Common: client contacts + recent interactions ──────────────────────────
  const [{ data: rawContacts }, { data: rawInteractions }] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("name, role, relationship_score, notes")
      .eq("client_id", clientId)
      .order("created_at"),
    supabase
      .from("interactions")
      .select("interaction_type, summary, interacted_at")
      .eq("client_id", clientId)
      .order("interacted_at", { ascending: false })
      .limit(3),
  ]);

  const contacts = (rawContacts ?? []) as Array<{
    name: string;
    role: string;
    relationship_score: number | null;
    notes: string | null;
  }>;

  const interactions = (rawInteractions ?? []) as Array<{
    interaction_type: string;
    summary: string | null;
    interacted_at: string;
  }>;

  const hm = contacts.find((c) => c.role === "hiring_manager");
  const hmName = hm?.name ?? "the hiring manager";
  const hmScore = hm?.relationship_score ?? 3;

  const schedulingContact =
    contacts.find((c) => c.role === "ta_coordinator") ??
    contacts.find((c) => c.role === "hr_gatekeeper") ??
    hm;
  const schedulingName = schedulingContact?.name ?? hmName;

  const toneInstruction =
    hmScore >= 4
      ? "Tone: warm and collegial — this is a strong relationship."
      : hmScore <= 2
        ? "Tone: professional and respectful but slightly formal — the relationship is still developing."
        : "Tone: professional and friendly.";

  const recentInteractionSummary = interactions
    .map(
      (i) =>
        `${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString()}: ${i.summary ?? "no summary"}`,
    )
    .join("\n");

  // ── Process-specific data ──────────────────────────────────────────────────
  type ProcRow = {
    id: string;
    stage: string;
    candidates: {
      id: string;
      full_name: string;
      current_title: string | null;
      current_company: string | null;
      notes_personality: string | null;
      notes_presentation: string | null;
      notes_closing: string | null;
      expected_total_min: number | null;
      expected_total_max: number | null;
    } | null;
    requisitions: {
      id: string;
      title: string;
      salary_min: number | null;
      salary_max: number | null;
      interview_rounds: number | null;
      interview_structure: unknown;
      hm_communication_style: string | null;
      hm_priority_beyond_jd: string | null;
      strategic_context: string | null;
      clients: { id: string; company_name: string } | null;
    } | null;
  };

  let proc: ProcRow | null = null;
  let motivations: Array<{ rank: number; motivation_text: string }> = [];
  let blockers: Array<{ theme: string; detail: string | null }> = [];

  if (processId && draftType !== "hr_intro") {
    const { data: procData } = await supabase
      .from("processes")
      .select(
        `id, stage,
         candidates (
           id, full_name, current_title, current_company,
           notes_personality, notes_presentation, notes_closing,
           expected_total_min, expected_total_max
         ),
         requisitions (
           id, title, salary_min, salary_max, interview_rounds,
           interview_structure, hm_communication_style, hm_priority_beyond_jd,
           strategic_context,
           clients ( id, company_name )
         )`,
      )
      .eq("id", processId)
      .single();

    proc = procData as ProcRow | null;

    if (proc?.candidates?.id) {
      const [{ data: motivData }, { data: blockerData }] = await Promise.all([
        supabase
          .from("candidate_motivations")
          .select("rank, motivation_text")
          .eq("candidate_id", proc.candidates.id)
          .order("rank")
          .limit(3),
        supabase
          .from("candidate_blockers")
          .select("theme, detail")
          .eq("candidate_id", proc.candidates.id)
          .eq("is_risk", true),
      ]);
      motivations = (motivData ?? []) as typeof motivations;
      blockers = (blockerData ?? []) as typeof blockers;
    }
  }

  const cand = proc?.candidates;
  const req = proc?.requisitions;
  const companyName = req?.clients?.company_name ?? "the client";
  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : null);

  // ── Build prompt + system by type ─────────────────────────────────────────
  let system = "";
  let prompt = "";
  let maxTokens = 600;

  if (draftType === "follow_up") {
    const isPostInterview = proc?.stage && ["1st interview", "2nd interview", "Final interview"].includes(proc.stage);
    const subject = isPostInterview
      ? `Re: ${cand?.full_name ?? "Candidate"} — interview feedback`
      : `Re: ${cand?.full_name ?? "Candidate"} — CV review`;

    system = `You are drafting a follow-up email for a recruiter to send to a hiring manager in Japan. The email requests outstanding feedback. It must be polite, short (4–6 sentences max), and feel human — not like a template. ${toneInstruction} ${FORBIDDEN}`;

    prompt = `
Recruiter is following up with ${hmName} at ${companyName}.
Candidate: ${cand?.full_name ?? "—"}, ${cand?.current_title ?? "—"} at ${cand?.current_company ?? "—"}
Role: ${req?.title ?? "—"}
Process stage: ${proc?.stage ?? "—"}
${isPostInterview ? "Interview completed — awaiting feedback." : "CV submitted — awaiting feedback."}

${recentInteractionSummary ? `Recent interactions:\n${recentInteractionSummary}` : ""}

Write a follow-up email. Start with the subject line on its own line (Subject: ...), then a blank line, then the body. No formal salutation — just ${hmName}. Sign off as [Recruiter name].
`.trim();
  }

  else if (draftType === "prep") {
    system = `You are writing candidate interview prep notes for a recruiter to share with their candidate before an interview at a foreign firm in Japan. Be specific and practical. The candidate reads this the evening before. ${FORBIDDEN}`;

    let structureBlock = "";
    if (Array.isArray(req?.interview_structure)) {
      const rounds = req.interview_structure as Array<{ round: number; interviewer: string; focus: string }>;
      structureBlock = rounds
        .map((r) => `Round ${r.round}: meets ${r.interviewer || "—"}. Focus: ${r.focus || "—"}`)
        .join("\n");
    }

    prompt = `
Candidate: ${cand?.full_name ?? "—"}, ${cand?.current_title ?? "—"}
Role: ${req?.title ?? "—"} at ${companyName}
Stage: ${proc?.stage ?? "—"}
${structureBlock ? `Interview structure:\n${structureBlock}` : `Interview rounds: ${req?.interview_rounds ?? "not specified"}`}
${req?.hm_priority_beyond_jd ? `HM priority beyond JD: ${req.hm_priority_beyond_jd}` : ""}
${req?.strategic_context ? `Why this role exists: ${req.strategic_context}` : ""}
${motivations.length > 0 ? `Candidate motivations (do not share directly): ${motivations.map((m) => m.motivation_text).join("; ")}` : ""}
${cand?.notes_presentation ? `Communication style: ${cand.notes_presentation}` : ""}

Write structured prep notes covering:
1. Company overview points (2–3 bullets — why ${companyName} is a strong choice for their profile)
2. What to emphasise in this interview (based on HM priorities and candidate motivations)
3. Round-by-round what to expect (if structure is known)
4. 3 questions to ask the interviewer
5. One thing to avoid or watch out for
`.trim();
    maxTokens = 700;
  }

  else if (draftType === "closing") {
    system = `You are writing a closing call script for a recruiter managing an offer-stage candidate in Japan. The script helps the recruiter lead a structured closing conversation. Format it as a practical script with natural language — not a rigid template. ${FORBIDDEN}`;

    prompt = `
Candidate: ${cand?.full_name ?? "—"}, currently at ${cand?.current_company ?? "—"}
Role: ${req?.title ?? "—"} at ${companyName}
Stage: ${proc?.stage ?? "—"}
Expected total: ${formatYen(cand?.expected_total_min ?? null)} – ${formatYen(cand?.expected_total_max ?? null)}
${motivations.length > 0 ? `Top motivations: ${motivations.map((m) => `${m.rank}. ${m.motivation_text}`).join("; ")}` : ""}
${blockers.length > 0 ? `Known risks: ${blockers.map((b) => `${b.theme}: ${b.detail ?? ""}`).join("; ")}` : ""}
${cand?.notes_closing ? `Closing intelligence (confidential): ${cand.notes_closing}` : ""}

Write a closing call script with:
1. Opener — check in, gauge energy
2. Reinforce the decision — anchor to their top 1–2 motivations
3. Anticipate and address the most likely objection based on known risks
4. Trial close — "If the offer comes in at [X], what would you need to say yes?"
5. Next steps — clear timeline and what happens next
`.trim();
    maxTokens = 700;
  }

  else if (draftType === "scheduling") {
    const nextRound = proc?.stage === "1st interview" ? "2nd interview"
      : proc?.stage === "2nd interview" ? "final interview"
      : "next interview round";

    system = `You are drafting a scheduling email for a recruiter. The email is sent to the client contact responsible for scheduling the next interview round. It should be brief (3–5 sentences), propose next steps, and make it easy for the recipient to reply with times. ${toneInstruction} ${FORBIDDEN}`;

    prompt = `
To: ${schedulingName} at ${companyName}
Candidate: ${cand?.full_name ?? "—"}
Role: ${req?.title ?? "—"}
Next step: schedule ${nextRound}
Current stage: ${proc?.stage ?? "—"}

${recentInteractionSummary ? `Recent context:\n${recentInteractionSummary}` : ""}

Write a scheduling email. Start with Subject: on its own line, then blank line, then body. Keep it short — propose asking for 2–3 available time slots. Address it to ${schedulingName}. Sign off as [Recruiter name].
`.trim();
  }

  else if (draftType === "report") {
    system = `You are an elite recruitment consultant writing a candidate submission report for a client in Japan. Write in clear accessible English. Include these sections with clear headers:
1. Executive summary (2–3 sentences)
2. Key recommendation points (3–4 bullets)
3. Career highlights (concise, focused on achievements)
4. Personality and communication style (use only notes_presentation and notes_personality — do NOT invent. Omit if no notes.)
5. Expected salary (state range clearly)
6. Why considering a move (frame positively — never reveal the raw internal reason for leaving)
7. Why this candidate fits the role
${FORBIDDEN}`;

    prompt = `
Candidate: ${cand?.full_name ?? "—"}, ${cand?.current_title ?? "—"} at ${cand?.current_company ?? "—"}
Target role: ${req?.title ?? "—"} at ${companyName}
Expected salary: ${formatYen(cand?.expected_total_min ?? null)} – ${formatYen(cand?.expected_total_max ?? null)}
${req?.strategic_context ? `Why this role exists: ${req.strategic_context}` : ""}
${motivations.length > 0 ? `Motivations (frame positively — do not expose ranking): ${motivations.map((m) => m.motivation_text).join("; ")}` : ""}
${cand?.notes_presentation ? `Presentation style: ${cand.notes_presentation}` : ""}
`.trim();
    maxTokens = 900;
  }

  else if (draftType === "hr_intro") {
    const hrContact = contacts.find((c) => c.role === "hr_gatekeeper");
    const hrName = hrContact?.name ?? "the HR contact";

    system = `You are drafting a brief email for a recruiter to introduce themselves to an HR gatekeeper at a client company in Japan. The goal is to build a direct relationship before deals get complicated. Keep it short (4–5 sentences), warm but professional. ${FORBIDDEN}`;

    prompt = `
Recruiter is reaching out to ${hrName} (HR) at ${companyName} for the first time.
Purpose: brief intro call — 15–20 minutes — to understand the hiring process better and build a direct working relationship.

Write the email. Subject line first, then blank line, then body. Address it to ${hrName}. Sign off as [Recruiter name].
`.trim();
  }

  else {
    return res.status(400).json({ error: "Unknown draft type" });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ content });
}
