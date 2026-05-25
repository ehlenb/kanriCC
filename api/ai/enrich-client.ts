import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body as { text: string };

  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: "Text too short — paste more company information." });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    system: `You are extracting structured company profile data for a recruiter in Japan.
The recruiter pastes raw text from a company website, LinkedIn page, or notes.
Extract only what is explicitly stated. Do not guess or hallucinate.

Return a JSON object with exactly these fields (null for any not found):
{
  "japan_role_in_group": string | null,       // e.g. "Japan subsidiary", "APAC HQ", "Representative office", "Independent KK"
  "japan_team_size": number | null,            // headcount in Japan
  "japan_team_japanese_pct": number | null,   // estimated % of Japanese nationals on Japan team (0–100)
  "years_in_japan": number | null,            // how many years operating in Japan
  "kk_entity": boolean | null,                // true if they have a KK or GK legal entity
  "strategy_notes": string | null             // 2–3 sentence summary of their Japan strategy and positioning (your analysis)
}

For kk_entity: true if text mentions KK, GK, kabushiki kaisha, or godo kaisha. Null if unclear.
For japan_role_in_group: be concise — one short phrase.
For strategy_notes: write as a recruiter briefing note, not marketing copy.
Return ONLY the JSON object. No markdown. No explanation.`,
    messages: [{ role: "user", content: text.slice(0, 4000) }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "{}";

  try {
    const parsed = JSON.parse(raw) as object;
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
