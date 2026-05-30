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

  const { candidate_id, transcript_raw, interaction_type, interacted_at } = req.body as {
    candidate_id: string;
    transcript_raw: string;
    interaction_type: string;
    interacted_at: string;
  };

  if (!candidate_id || !transcript_raw?.trim()) {
    return res.status(400).json({ error: "candidate_id and transcript_raw are required" });
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "full_name, current_company, current_title, japanese_level, english_level, candidate_status, source, current_base, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notice_period_months, email, phone, linkedin_url, additional_languages, availability_date",
    )
    .eq("id", candidate_id)
    .single();

  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const c = candidate as Record<string, unknown>;

  const existingFields = Object.entries(c)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    system: `You are a recruiting intelligence assistant processing a candidate interview transcript.

Extract only information that is clearly stated in the transcript. Never infer or guess.
Do not overwrite fields that already have data unless the transcript explicitly updates them.
Flag updates with is_update: true and include the previous value.

Language levels (Japan standard scale): Native / Fluent / High Business / Business / Low Business / High Conversational / Conversational / Low Conversational / Basic / None
All compensation as annual JPY integers.
Motivation types (use these exact values): salary / career_progression / international_environment / wlb / stability / brand / remote / leadership / other

Return a JSON object with exactly this structure:
{
  "suggested_field_updates": [
    {
      "field": string,
      "suggested_value": unknown,
      "previous_value": unknown,
      "source": string,
      "is_update": boolean
    }
  ],
  "suggested_motivations": [
    {
      "rank": number,
      "motivation_type": string,
      "detail": string
    }
  ],
  "suggested_blockers": [
    {
      "theme": string,
      "detail": string,
      "is_risk": boolean
    }
  ],
  "suggested_competing_interviews": [
    {
      "company_name": string,
      "stage": string,
      "source": "self_disclosed"
    }
  ],
  "interaction_summary": string,
  "interaction_full_notes": string
}

interaction_summary: 1-2 sentence summary for timeline display.
interaction_full_notes: cleaned, structured notes from the transcript. Paragraph form. No fabrication.
Return ONLY the JSON object. No markdown fences. No explanation.`,
    messages: [
      {
        role: "user",
        content: `EXISTING CANDIDATE FIELDS:\n${existingFields}\n\nTRANSCRIPT:\n${transcript_raw.slice(0, 8000)}`,
      },
    ],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as object;
    return res.status(200).json({ ...parsed, interaction_type, interacted_at, transcript_raw });
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
