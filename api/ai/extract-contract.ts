import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { contract_text } = req.body as { contract_text?: string };
  if (!contract_text || contract_text.trim().length < 20) {
    return res.status(400).json({ error: "contract_text is required" });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Extract the following fields from this recruitment contract or fee agreement. Only return fields you can clearly identify. Do not guess.

Contract text:
${contract_text.slice(0, 4000)}

Return a JSON object with these fields (omit any you cannot determine):
- fee_pct: placement fee as a number, e.g. 30 for 30% (number)
- started_at: contract start date in YYYY-MM-DD format (string)

Return only the JSON object, no other text.`,
        },
      ],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    let extracted: { fee_pct?: number; started_at?: string } = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]) as typeof extracted;
    } catch {
      // return empty if parsing fails
    }

    return res.status(200).json({ data: extracted });
  } catch (err) {
    console.error("extract-contract error:", err);
    return res.status(200).json({ error: "Could not extract fields from contract." });
  }
}
