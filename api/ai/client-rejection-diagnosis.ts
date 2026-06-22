import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { requisition_id } = req.body as { requisition_id: string };
  if (!requisition_id) return res.status(400).json({ error: "requisition_id is required" });

  // Fetch requisition details
  const { data: req_ } = await supabase
    .from("requisitions")
    .select(
      "title, jd_text, salary_min, salary_max, salary_range_text, clients ( company_name, fee_pct ), requisition_conditions ( condition_text, condition_type, priority_rank )",
    )
    .eq("id", requisition_id)
    .single();

  if (!req_) return res.status(404).json({ error: "Requisition not found" });

  const reqData = req_ as {
    title: string;
    jd_text: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_range_text: string | null;
    clients: { company_name: string; fee_pct: number | null } | null;
    requisition_conditions: Array<{ condition_text: string; condition_type: string; priority_rank: number }>;
  };

  // Fetch all processes on this requisition that were rejected or went nowhere after CV Sent
  const { data: processes } = await supabase
    .from("processes")
    .select(
      "id, stage, cv_sent_at, ccm_outcome, ccm_feedback_notes, closed_reason, candidate_id, candidates ( full_name, japanese_level, english_level, current_total, expected_total_min, expected_total_max, notes_pitch )",
    )
    .eq("requisition_id", requisition_id);

  type ProcessRow = {
    id: string;
    stage: string;
    cv_sent_at: string | null;
    ccm_outcome: string | null;
    ccm_feedback_notes: string | null;
    closed_reason: string | null;
    candidate_id: string;
    candidates: {
      full_name: string;
      japanese_level: string | null;
      english_level: string | null;
      current_total: number | null;
      expected_total_min: number | null;
      expected_total_max: number | null;
      notes_pitch: string | null;
    } | null;
  };

  const allProcesses = (processes ?? []) as ProcessRow[];

  // Identify confirmed rejections
  const rejections = allProcesses.filter((p) => {
    // Explicit: closed lost after reaching CV Sent or beyond
    if (p.stage === "Closed lost" && p.cv_sent_at) return true;
    // CCM fail = interviewed and declined
    if (p.ccm_outcome === "fail") return true;
    return false;
  });

  // Also fetch recent interaction notes on rejected processes to catch explicit rejection language in notes
  let rejectionNotes: Array<{ candidate_name: string; note: string }> = [];
  if (rejections.length > 0) {
    const rejectedIds = rejections.map((p) => p.id);
    const { data: recentNotes } = await supabase
      .from("interactions")
      .select("process_id, summary, full_notes")
      .in("process_id", rejectedIds)
      .order("interacted_at", { ascending: false });

    const notesByProcess = new Map<string, string>();
    for (const note of recentNotes ?? []) {
      const n = note as { process_id: string | null; summary: string | null; full_notes: string | null };
      if (n.process_id && !notesByProcess.has(n.process_id)) {
        notesByProcess.set(n.process_id, n.full_notes?.slice(0, 300) ?? n.summary ?? "");
      }
    }

    rejectionNotes = rejections
      .filter((p) => notesByProcess.has(p.id))
      .map((p) => ({
        candidate_name: p.candidates?.full_name ?? "Unknown",
        note: notesByProcess.get(p.id) ?? "",
      }));
  }

  // Count total CVs sent (all processes that reached CV Sent or beyond, excluding Specs Sent/Buy-In)
  const cvsSent = allProcesses.filter((p) =>
    !["Specs Sent", "Buy-In"].includes(p.stage) || p.cv_sent_at,
  ).length;

  const mustHave = reqData.requisition_conditions
    .filter((c) => c.condition_type === "must_have")
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((c) => `- ${c.condition_text}`)
    .join("\n");

  const rejectionProfiles = rejections
    .map((p) => {
      const cand = p.candidates;
      return `  Candidate: ${cand?.full_name ?? "Unknown"}
  Japanese: ${cand?.japanese_level ?? "—"} | English: ${cand?.english_level ?? "—"}
  Comp: current ${formatYen(cand?.current_total ?? null)}, target ${formatYen(cand?.expected_total_min ?? null)}–${formatYen(cand?.expected_total_max ?? null)}
  Stage reached: ${p.stage}
  CCM outcome: ${p.ccm_outcome ?? "n/a"}
  CCM feedback: ${p.ccm_feedback_notes ?? "none recorded"}
  Closed reason: ${p.closed_reason ?? "none recorded"}
  ${cand?.notes_pitch ? `Pitch notes: ${cand.notes_pitch.slice(0, 200)}` : ""}`;
    })
    .join("\n\n");

  const prompt = `
ROLE: ${reqData.title} at ${reqData.clients?.company_name ?? "Unknown client"}
Salary: ${reqData.salary_range_text ?? `${formatYen(reqData.salary_min)} – ${formatYen(reqData.salary_max)}`}
${mustHave ? `Must-have criteria:\n${mustHave}` : "No must-have criteria recorded."}

CVs sent: ${cvsSent}
Confirmed rejections: ${rejections.length}

REJECTED CANDIDATE PROFILES:
${rejectionProfiles || "No profile data available."}

REJECTION NOTES FROM ACTIVITY LOG:
${rejectionNotes.length > 0 ? rejectionNotes.map((n) => `${n.candidate_name}: ${n.note}`).join("\n") : "None."}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 800,
    system: `You are a senior recruiting advisor diagnosing why a client keeps rejecting candidates on a role.

Analyze the rejection pattern and return a JSON diagnosis. Choose the most accurate path.

Return valid JSON only. No markdown fences. No commentary.

{
  "path": "off_spec" | "expectation_management",
  "headline": "One sentence summarizing the core problem.",
  "diagnosis": "2–3 sentences explaining what the data shows. Be specific about which criteria the candidates missed or why the spec may be unrealistic.",
  "suggested_action": "One concrete next step for the recruiter.",
  "conversation_guides": {
    "data_driven": "2–3 sentences. Market reality framing: what the criteria rules out and what is realistically available at this salary in Japan bilingual market.",
    "relationship_first": "2–3 sentences. Consultative framing: position as a market intelligence update, not a pushback. Warm and collaborative."
  }
}

For "off_spec" path: diagnosis focuses on which specific criteria or profile attributes the sent candidates missed. conversation_guides help the recruiter recalibrate.
For "expectation_management" path: diagnosis focuses on the gap between what the client wants and what the market can provide at this salary. conversation_guides help the recruiter have a spec-reset conversation with the HM.

Japan context: Language levels are strict — a "Business Japanese" requirement at a domestic-heavy client often means closer to Native in practice. Salary benchmarks for bilingual professionals in Japan: ¥10M–¥15M for senior bilingual roles.

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Plain English.`,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      path: string;
      headline: string;
      diagnosis: string;
      suggested_action: string;
      conversation_guides: { data_driven: string; relationship_first: string };
    };
    return res.status(200).json({
      ...parsed,
      cvs_sent: cvsSent,
      rejections: rejections.length,
    });
  } catch {
    return res.status(200).json({ error: "Could not parse diagnosis. Try again." });
  }
}
