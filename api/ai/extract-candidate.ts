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

  const { candidateId, storageKey } = req.body as {
    candidateId: string;
    storageKey: string;
  };

  if (!candidateId || !storageKey) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("resumes")
    .download(storageKey);

  if (dlErr || !fileBlob) {
    return res.status(500).json({ error: "Failed to download CV from storage" });
  }

  const buffer = await fileBlob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    system: `You are extracting structured candidate data from a CV or resume for a recruiter in Japan.
Extract only what is explicitly stated in the document. Do not infer, estimate, or hallucinate data.
Salary values in Japan are typically annual figures in JPY (millions). Convert if needed.

Language levels use the Japan standard scale:
Native / Fluent / High Business / Business / Low Business / High Conversational / Conversational / Low Conversational / Basic / None

Return a JSON object with exactly these fields (use null for any field not found):
{
  "full_name": string | null,
  "full_name_japanese": string | null,
  "current_title": string | null,
  "current_company": string | null,
  "age": number | null,
  "email": string | null,
  "phone": string | null,
  "linkedinUrl": string | null,
  "japanese_level": "Native" | "Fluent" | "High Business" | "Business" | "Low Business" | "High Conversational" | "Conversational" | "Low Conversational" | "Basic" | "None" | null,
  "english_level": "Native" | "Fluent" | "High Business" | "Business" | "Low Business" | "High Conversational" | "Conversational" | "Low Conversational" | "Basic" | "None" | null,
  "additionalLanguages": string | null,
  "notice_period_months": number | null,
  "noticePeriodMonths": number | null,
  "current_base": number | null,
  "current_total": number | null,
  "source": null,
  "roles": [
    {
      "company_name": string,
      "title": string,
      "start_date": string | null,
      "end_date": string | null,
      "is_current": boolean,
      "description": string | null,
      "reasonForLeaving": string | null
    }
  ]
}

Notes:
- email: candidate's personal email if present (not the company email).
- linkedinUrl: full LinkedIn profile URL if present.
- additionalLanguages: any languages beyond Japanese and English, with level (e.g. "Korean: Business, Mandarin: Conversational"). Null if none.
- noticePeriodMonths: notice period as integer months if stated. Use notice_period_months for the same value.
- source: always null — the recruiter sets this manually.
- reasonForLeaving: reason for leaving this role if stated in the CV, raw as written. Null if not stated or if is_current is true.
- Dates must be in "YYYY-MM" format.
- description must be under 200 characters.
Return ONLY the JSON object. No markdown. No explanation.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          } as Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"][0],
          {
            type: "text",
            text: "Extract the candidate data from this CV.",
          },
        ],
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const extracted = JSON.parse(cleaned) as object;
    return res.status(200).json(extracted);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw: text });
  }
}
