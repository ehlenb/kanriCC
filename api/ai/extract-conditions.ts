import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { requisition_id, jd_text } = req.body as {
    requisition_id: string;
    jd_text: string;
  };

  if (!requisition_id || !jd_text?.trim()) {
    return res.status(400).json({ error: "requisition_id and jd_text are required" });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: `You are extracting structured hiring conditions from a job description for a recruiter in Japan.

Extract conditions that are explicitly stated in the JD as requirements or preferences.
Classify each as must_have (clearly required) or nice_to_have (preferred or advantageous).
Write each condition as a short, specific statement. Maximum 15 words per condition.
Do not combine multiple requirements into one condition.
Suggested priority_rank: must_have conditions rank 1-N in order of prominence. nice_to_have conditions rank after all must_haves.
Maximum 10 conditions total. Quality over quantity.
Never fabricate. Only extract what is written.

Return a JSON object with this exact structure:
{
  "conditions": [
    {
      "condition_text": string,
      "condition_type": "must_have" | "nice_to_have",
      "source": "jd",
      "priority_rank": number
    }
  ]
}

Return ONLY the JSON object. No markdown fences. No explanation.`,
    messages: [{ role: "user", content: jd_text.slice(0, 6000) }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { conditions: unknown[] };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
