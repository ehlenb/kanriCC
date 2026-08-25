// 職務経歴書 builder, generation step (Wave 6, piece 4). Scope is the
// standard Japanese career-history document, not generic CV reformatting --
// the strategy report calls "make this CV look nice" a commodity and
// separately calls this specific document "a different product and worth
// building." Section 10's register rule applies exactly as it did for
// suisenbun.ts: generate natively in Japanese, never translate-after.
//
// `candidates.cv_url` is populated for only 2 of 202 seed candidates, so this
// cannot assume an uploaded CV exists. `candidate_roles` is even thinner (2
// rows total) -- notes_interview is the real source of truth for this
// candidate base, same finding the June 2026 session log already recorded for
// positioning.ts/pre-call-briefing.ts. This handler follows the same
// precedence: candidate_roles is used when present, notes_interview always
// backs it up.
//
// This produces the editable draft only. The separate, non-AI
// lib/export-handlers/shokumu-keirekisho-docx.ts turns the (possibly
// recruiter-edited) draft into a .docx file -- kept as two steps so "AI
// drafts" and "system exports" stay cleanly separated and editability is
// never bypassed.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import { extractJson } from "./lib/parse-json-response.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type ShokumuKeirekisho = {
  career_summary: string;
  roles: Array<{ period: string; company: string; title: string; achievements: string }>;
  skills: string;
  self_pr: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidate_id } = req.body as { candidate_id: string };
  if (!candidate_id) return res.status(400).json({ error: "candidate_id is required" });

  const [{ data: candidate }, { data: roles }] = await Promise.all([
    supabase
      .from("candidates")
      .select("full_name, full_name_japanese, current_company, current_title, notes_interview, ai_context")
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("candidate_roles")
      .select("company_name, title, start_date, end_date, is_current, achievement_notes")
      .eq("candidate_id", candidate_id)
      .order("start_date", { ascending: true }),
  ]);

  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const rolesText = (roles ?? [])
    .map((r) => `${r.start_date ?? "?"}〜${r.is_current ? "現在" : (r.end_date ?? "?")} ${r.company_name} ${r.title ?? ""}: ${r.achievement_notes ?? ""}`)
    .join("\n");

  const prompt = `候補者: ${candidate.full_name}${candidate.full_name_japanese ? `（${candidate.full_name_japanese}）` : ""}
現職: ${candidate.current_title ?? "—"} at ${candidate.current_company ?? "—"}

【構造化された職歴データ】
${rolesText || "登録なし。以下の面談メモが情報源です。"}

【面談メモ】
${candidate.notes_interview?.slice(0, 3000) ?? "なし"}

${candidate.ai_context ? `【候補者インテリジェンス要約】\n${candidate.ai_context.slice(0, 1000)}` : ""}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: `あなたは日系人材紹介会社のコンサルタントです。候補者情報から標準的な日本語の職務経歴書の内容を作成してください。英語で下書きしてから翻訳するのではなく、最初から自然な日本語のビジネス文書として作成してください。

以下のJSON形式のみで出力してください。マークダウン、説明文は一切不要です。

{
  "career_summary": "職務要約（3〜4文、これまでのキャリアの要点）",
  "roles": [{"period": "YYYY年M月〜YYYY年M月", "company": "会社名", "title": "役職", "achievements": "具体的な数字を用いた実績（箇条書きは改行区切りで2〜4項目）"}],
  "skills": "活かせる経験・知識・技術（簡潔にまとめる）",
  "self_pr": "自己PR（3〜4文）"
}

情報が不足している項目は無理に埋めず、分かる範囲で作成してください。実績は具体的な数字を優先し、誇張は避けてください。`,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(extractJson(raw)) as ShokumuKeirekisho;

    return res.status(200).json({ draft: parsed });
  } catch (err) {
    console.error("[shokumu-keirekisho]", err instanceof Error ? err.message : err);
    return res.status(200).json({ error: "Could not generate 職務経歴書. Try again." });
  }
}
