import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clientId, title, whyRoleOpened, isBackfill, requisitionId } = req.body as {
    clientId: string;
    title: string;
    whyRoleOpened: string;
    isBackfill: boolean;
    requisitionId?: string;
  };

  if (!clientId || !title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [{ data: client }, conditionsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("company_name, strategy_notes, japan_role_in_group, years_in_japan, ai_context")
      .eq("id", clientId)
      .single(),
    requisitionId
      ? supabase
          .from("requisition_conditions")
          .select("condition_text, condition_type, priority_rank")
          .eq("requisition_id", requisitionId)
          .order("priority_rank")
      : Promise.resolve({ data: null }),
  ]);

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  const cl = client as {
    company_name: string;
    strategy_notes: string | null;
    japan_role_in_group: string | null;
    years_in_japan: number | null;
    ai_context: string | null;
  };

  const conditions = (conditionsResult.data ?? []) as Array<{
    condition_text: string;
    condition_type: string;
    priority_rank: number;
  }>;

  const mustHave = conditions
    .filter((c) => c.condition_type === "must_have")
    .map((c) => `- ${c.condition_text}`)
    .join("\n");

  const prompt = `
Company: ${cl.company_name}
${cl.japan_role_in_group ? `Japan role in group: ${cl.japan_role_in_group}` : ""}
${cl.years_in_japan ? `Years in Japan: ${cl.years_in_japan}` : ""}
${cl.strategy_notes ? `Company strategy notes:\n${cl.strategy_notes.slice(0, 400)}` : ""}
${cl.ai_context ? `Account intelligence:\n${cl.ai_context.slice(0, 400)}` : ""}

Role being hired: ${title}
${isBackfill ? `Backfill context: ${whyRoleOpened}` : `Why role exists: ${whyRoleOpened}`}
${mustHave ? `\nKey role requirements:\n${mustHave}` : ""}

Write a strategic context paragraph (3-4 sentences) explaining why this role matters to this company right now. Frame it from a business value perspective — not a job description. This will help the recruiter pitch the role compellingly to candidates.
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: `You write concise strategic framing for open roles at foreign companies in Japan. Your output goes into a recruiter's internal notes — it should help them explain the business case for a role in 30 seconds. Write in clear English. Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes. No bullet points — prose only.`,
    messages: [{ role: "user", content: prompt }],
  });

  const content =
    message.content[0].type === "text" ? message.content[0].text : "";

  return res.status(200).json({ content });
}
