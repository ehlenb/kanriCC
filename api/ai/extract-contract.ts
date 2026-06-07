import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `You extract placement fee information from recruitment agency contracts.
The contract may be written in English, Japanese, or both.
Extract only what is explicitly stated. Do not guess or infer.

Common Japanese terms:
- 手数料 / 紹介手数料 / フィー = placement fee
- 年収 = annual salary
- % / パーセント = percent
- 契約日 / 開始日 / 締結日 = contract start date

Return a JSON object with these fields (omit any you cannot determine with confidence):
- fee_pct: the placement fee as a plain number, e.g. 30 for 30% (number)
- started_at: contract start date in YYYY-MM-DD format (string)

Return only the JSON object. No markdown. No explanation.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { storageKey, contract_text } = req.body as {
    storageKey?: string;
    contract_text?: string;
  };

  if (!storageKey && (!contract_text || contract_text.trim().length < 20)) {
    return res.status(400).json({ error: "storageKey or contract_text is required" });
  }

  try {
    let extracted: { fee_pct?: number; started_at?: string } = {};

    if (storageKey) {
      // PDF path — download from storage and send as native document
      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("resumes")
        .download(storageKey);

      if (dlErr || !fileBlob) {
        console.error("extract-contract: storage download failed", dlErr);
        return res.status(200).json({ error: "Could not download contract from storage." });
      }

      const buffer = await fileBlob.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 },
              } as Parameters<typeof anthropic.messages.create>[0]["messages"][0]["content"][0],
              { type: "text", text: "Extract the placement fee and contract start date from this contract." },
            ],
          },
        ],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]) as typeof extracted;
    } else {
      // DOCX / plain-text path
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extract the placement fee and contract start date from this contract text:\n\n${contract_text!.slice(0, 8000)}`,
          },
        ],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]) as typeof extracted;
    }

    return res.status(200).json({ data: extracted });
  } catch (err) {
    console.error("extract-contract error:", err);
    return res.status(200).json({ error: "Could not extract fields from contract." });
  }
}
