import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { company_name, url, question } = req.body as {
    company_name: string;
    url?: string;
    question: string;
  };

  if (!company_name || !question) {
    return res.status(400).json({ error: "company_name and question are required" });
  }

  const urlHint = url?.trim() ? ` Their website is ${url.trim()}.` : "";
  const userMessage = `Company: "${company_name}".${urlHint}\n\nQuestion: ${question}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `You are a Japan market research assistant for a recruitment agency. Search the web and answer the question with specific facts and numbers in 2–4 sentences. Be direct — do not say "I'll search" or announce what you're doing. Just give the answer. If the information is not publicly available, say so plainly in one sentence. Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes.`,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as Parameters<typeof anthropic.messages.create>[0]["tools"][0]],
      messages: [{ role: "user", content: userMessage }],
    });

    const answer = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join(" ")
      .trim();

    if (!answer) return res.status(200).json({ error: "No answer returned. Try rephrasing the question." });
    return res.status(200).json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error("[chat-enrich-client]", message);
    return res.status(200).json({ error: "Search failed. Try again." });
  }
}
