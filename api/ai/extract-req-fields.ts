import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { jd_text } = req.body as { jd_text?: string };
  if (!jd_text || jd_text.trim().length < 20) {
    return res.status(400).json({ error: "jd_text is required" });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Extract structured fields from this job description. Return only what you can clearly identify. Do not guess or invent values.

Job description:
${jd_text.slice(0, 4000)}

Return a JSON object with these fields (omit any field you cannot determine):
- title: job title (string)
- salary_range_text: salary information exactly as stated, e.g. "¥8M–¥12M base + 15% bonus" (string)
- location: work location, e.g. "Tokyo, hybrid 3 days in-office" (string)

Return only the JSON object, no other text.`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    let extracted: Record<string, string> = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]) as Record<string, string>;
    } catch {
      // return empty if parsing fails
    }

    return res.status(200).json({ data: extracted });
  } catch (err) {
    console.error("extract-req-fields error:", err);
    return res.status(200).json({ error: "Could not extract fields from JD." });
  }
}
