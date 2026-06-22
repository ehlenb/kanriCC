import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CompanyEnrichment {
  strategy_notes: string;
  years_in_japan?: number;
  japan_team_size?: number;
}

const SYSTEM_PROMPT = `You are a Japan market research analyst for a bilingual talent recruitment agency.

Write a concise intelligence paragraph (120–180 words) suitable for a recruiter's strategy notes. Cover what you know about the company's Japan operations:
- How long the company has operated in Japan and how they entered the market
- Approximate Japan team size or headcount
- Their role within the global group (subsidiary, APAC HQ, representative office, etc.)
- Business focus and strategic priorities in Japan
- Notable hiring trends or recent activity in Japan

Write in plain, professional English. Flowing prose only — no headers, no bullet points. Be specific and factual; omit anything you are uncertain about rather than guessing.

Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes.

After the paragraph, on a new line output exactly:
JSON: {"years_in_japan": <number>, "japan_team_size": <number>}

Only include fields you can confirm. If you cannot confirm either, output:
JSON: {}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { company_name, url } = req.body as {
    company_name?: string;
    url?: string;
  };

  if (!company_name && !url) return res.status(400).json({ error: "company_name or url is required" });

  const companyLabel = company_name ?? url ?? "this company";
  const urlHint = url?.trim() ? ` Their website is ${url.trim()}.` : "";

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Write strategy notes for "${companyLabel}" based on what you know about their Japan operations.${urlHint}`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text.trim() : "";

    const jsonMarker = raw.lastIndexOf("\nJSON:");
    const paragraph = jsonMarker >= 0 ? raw.slice(0, jsonMarker).trim() : raw;
    const jsonStr = jsonMarker >= 0 ? raw.slice(jsonMarker + 6).trim() : "{}";

    let structured: { years_in_japan?: number; japan_team_size?: number } = {};
    try { structured = JSON.parse(jsonStr) as typeof structured; } catch { /* best-effort */ }

    return res.status(200).json({ enrichment: { strategy_notes: paragraph, ...structured } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    console.error("[enrich-client]", message);
    return res.status(200).json({ error: message });
  }
}
