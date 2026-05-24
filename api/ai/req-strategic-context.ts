import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clientId, title, whyRoleOpened, isBackfill } = req.body as {
    clientId: string;
    title: string;
    whyRoleOpened: string;
    isBackfill: boolean;
  };

  if (!clientId || !title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("company_name, strategy_notes, japan_role_in_group, years_in_japan")
    .eq("id", clientId)
    .single();

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  const prompt = `
Company: ${(client as { company_name: string }).company_name}
${(client as { japan_role_in_group: string | null }).japan_role_in_group ? `Japan role in group: ${(client as { japan_role_in_group: string }).japan_role_in_group}` : ""}
${(client as { years_in_japan: number | null }).years_in_japan ? `Years in Japan: ${(client as { years_in_japan: number }).years_in_japan}` : ""}
${(client as { strategy_notes: string | null }).strategy_notes ? `Company strategy notes:\n${(client as { strategy_notes: string }).strategy_notes}` : ""}

Role being hired: ${title}
${isBackfill ? `Backfill context: ${whyRoleOpened}` : `Why role exists: ${whyRoleOpened}`}

Write a strategic context paragraph (3–4 sentences) explaining why this role matters to this company right now. Frame it from a business value perspective — not a job description. This will help the recruiter pitch the role compellingly to candidates.
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: `You write concise strategic framing for open roles at foreign companies in Japan. Your output goes into a recruiter's internal notes — it should help them explain the business case for a role in 30 seconds. Write in clear English. Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes. No bullet points — prose only.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content =
    message.content[0].type === "text" ? message.content[0].text : "";

  return res.status(200).json({ content });
}
