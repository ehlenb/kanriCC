import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
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

  // Download file from Supabase Storage using service role
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("resumes")
    .download(storageKey);

  if (dlErr || !fileBlob) {
    return res.status(500).json({ error: "Failed to download CV from storage" });
  }

  const buffer = await fileBlob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: `You are extracting structured candidate data from a CV or resume for a recruiter in Japan.
Extract only what is explicitly stated in the document. Do not infer, estimate, or hallucinate data.
Salary values in Japan are typically annual figures in JPY (millions). Convert if needed.
Return a JSON object with exactly these fields (use null for any field not found):
{
  "full_name": string | null,
  "full_name_japanese": string | null,
  "current_title": string | null,
  "current_company": string | null,
  "age": number | null,
  "japanese_level": "Native" | "Business" | "Conversational" | "Basic" | "None" | null,
  "english_level": "Native" | "Business" | "Conversational" | "Basic" | "None" | null,
  "notice_period_months": number | null,
  "current_base": number | null,
  "current_total": number | null,
  "roles": [
    {
      "company_name": string,
      "title": string,
      "start_date": string | null,
      "end_date": string | null,
      "is_current": boolean,
      "description": string | null
    }
  ]
}
Dates must be in "YYYY-MM" format. Description must be under 200 characters.
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

  try {
    const extracted = JSON.parse(text) as object;
    return res.status(200).json(extracted);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw: text });
  }
}
