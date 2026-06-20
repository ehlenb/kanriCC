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

  const { candidate_ids, requisition_id } = req.body as {
    candidate_ids: string[];
    requisition_id: string;
  };

  if (!candidate_ids?.length || !requisition_id) {
    return res.status(400).json({ error: "candidate_ids and requisition_id are required" });
  }

  const [{ data: candidates }, { data: requisition }] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, active_passive, urgency_notes, current_total, expected_total_min, expected_total_max, notes_pitch, notes_personality, japanese_level, english_level",
      )
      .in("id", candidate_ids),
    supabase
      .from("requisitions")
      .select("title, salary_min, salary_max, salary_range_text, clients(company_name)")
      .eq("id", requisition_id)
      .single(),
  ]);

  if (!candidates?.length || !requisition) {
    return res.status(404).json({ error: "Data not found" });
  }

  const r = requisition as {
    title: string;
    salary_min: number | null;
    salary_max: number | null;
    salary_range_text: string | null;
    clients: { company_name: string } | null;
  };

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : null);
  const salaryLine = r.salary_range_text ?? [formatYen(r.salary_min), formatYen(r.salary_max)].filter(Boolean).join("–");

  const candidateLines = (candidates as {
    id: string;
    full_name: string;
    active_passive: string | null;
    urgency_notes: string | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    notes_pitch: string | null;
    notes_personality: string | null;
    japanese_level: string | null;
    english_level: string | null;
  }[]).map((c) => {
    const compFit = (() => {
      if (!c.expected_total_min && !c.expected_total_max) return "comp expectation unknown";
      const min = formatYen(c.expected_total_min ?? null);
      const max = formatYen(c.expected_total_max ?? null);
      return `expects ${[min, max].filter(Boolean).join("–")}`;
    })();
    return `ID: ${c.id}
Name: ${c.full_name}
Status: ${c.active_passive ?? "unknown"}
${c.urgency_notes ? `Urgency: ${c.urgency_notes}` : ""}
Comp: ${compFit}
${c.notes_pitch ? `Pitch notes: ${c.notes_pitch.slice(0, 150)}` : ""}
${c.notes_personality ? `Personality: ${c.notes_personality.slice(0, 100)}` : ""}`;
  }).join("\n\n");

  const prompt = `You are helping a Japan-market recruiter decide which candidates to call personally versus send a cold email.

ROLE: ${r.title} at ${r.clients?.company_name ?? "client"}
${salaryLine ? `Salary: ${salaryLine}` : ""}

CANDIDATES:
${candidateLines}

Rank these candidates by call priority. A phone call is worth it for candidates who are:
- Active job seekers or have stated urgency to move
- A strong comp fit for this role
- Likely to respond warmly (personality, pitch notes suggest engagement)

For each candidate return:
- priority: "call" (worth a personal call) or "email" (send the spec by email first)
- reason: one sentence max, plain English, direct

Return valid JSON only — no markdown, no explanation:
[{ "candidate_id": "...", "priority": "call" | "email", "reason": "..." }]

Order from highest call priority to lowest.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "[]";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { candidate_id: string; priority: "call" | "email"; reason: string }[];
    return res.status(200).json({ rankings: parsed });
  } catch {
    return res.status(200).json({ error: "Could not generate call priority. Try again.", raw });
  }
}
