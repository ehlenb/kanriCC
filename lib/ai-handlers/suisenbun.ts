import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function formatYen(n: number | null): string {
  return n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidate_id, requisition_id } = req.body as { candidate_id: string; requisition_id: string };
  if (!candidate_id || !requisition_id) {
    return res.status(400).json({ error: "candidate_id and requisition_id are required" });
  }

  const [
    { data: candidate },
    { data: roles },
    { data: motivations },
    { data: requisition },
    { data: conditions },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, age, current_company, current_title, japanese_level, english_level, notice_period_months, current_base, current_bonus, current_total, expected_total_min, expected_total_max, availability_date, notes_pitch, notes_closing, ai_context",
      )
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("candidate_roles")
      .select("company_name, title, start_date, end_date, is_current, achievement_notes, reason_for_leaving_raw")
      .eq("candidate_id", candidate_id)
      .order("start_date", { ascending: true }),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text")
      .eq("candidate_id", candidate_id)
      .order("rank"),
    supabase
      .from("requisitions")
      .select("title, salary_min, salary_max, salary_range_text, jd_text, strategic_context, clients ( company_name, ai_context )")
      .eq("id", requisition_id)
      .single(),
    supabase
      .from("requisition_conditions")
      .select("condition_text, condition_type, priority_rank")
      .eq("requisition_id", requisition_id)
      .order("priority_rank"),
  ]);

  if (!candidate || !requisition) {
    return res.status(404).json({ error: "Candidate or requisition not found" });
  }

  const c = candidate as {
    full_name: string;
    full_name_japanese: string | null;
    age: number | null;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    notice_period_months: number | null;
    current_base: number | null;
    current_bonus: number | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    availability_date: string | null;
    notes_pitch: string | null;
    notes_closing: string | null;
    ai_context: string | null;
  };

  const r = requisition as {
    title: string;
    salary_min: number | null;
    salary_max: number | null;
    salary_range_text: string | null;
    jd_text: string | null;
    strategic_context: string | null;
    clients: { company_name: string; ai_context: string | null } | null;
  };

  const rolesText = (roles ?? [])
    .map((role: {
      company_name: string;
      title: string | null;
      start_date: string | null;
      end_date: string | null;
      is_current: boolean;
      achievement_notes: string | null;
      reason_for_leaving_raw: string | null;
    }) =>
      `- ${role.company_name}${role.is_current ? " (current)" : ""}: ${role.title ?? "—"}. ${role.achievement_notes?.slice(0, 300) ?? ""}${role.reason_for_leaving_raw && !role.is_current ? ` Reason for leaving: ${role.reason_for_leaving_raw.slice(0, 100)}` : ""}`,
    )
    .join("\n");

  const motivationsText = (motivations ?? [])
    .map((m: { rank: number; motivation_text: string }) => `${m.rank}. ${m.motivation_text}`)
    .join("\n");

  const mustHaveConditions = (conditions ?? [])
    .filter((cond: { condition_type: string }) => cond.condition_type === "must_have")
    .map((cond: { condition_text: string; priority_rank: number }) => `${cond.priority_rank}. ${cond.condition_text}`)
    .join("\n");

  const candidateContext = `
Candidate: ${c.full_name}${c.full_name_japanese ? ` (${c.full_name_japanese})` : ""}${c.age ? `, age ${c.age}` : ""}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Notice period: ${c.notice_period_months ? `${c.notice_period_months} months` : "—"}
Desired start: ${c.availability_date ?? "not specified"}
Compensation: current ${formatYen(c.current_total)} (base ${formatYen(c.current_base)}${c.current_bonus ? ` + bonus ${formatYen(c.current_bonus)}` : ""}), target ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}

Career history (oldest to current):
${rolesText || "None recorded."}

Top motivations, ranked by the candidate (sequence the letter's framing to match this order):
${motivationsText || "None recorded."}

${c.notes_pitch ? `Recruiter's pitch notes: ${c.notes_pitch.slice(0, 400)}` : ""}
${c.notes_closing ? `Recruiter's closing notes: ${c.notes_closing.slice(0, 300)}` : ""}
${c.ai_context ? `Candidate intelligence summary:\n${c.ai_context}` : ""}`;

  const roleContext = `
Role: ${r.title} at ${r.clients?.company_name ?? "—"}
Salary: ${r.salary_range_text ?? `${formatYen(r.salary_min)}–${formatYen(r.salary_max)}`}
${r.strategic_context ? `Strategic context: ${r.strategic_context.slice(0, 400)}` : ""}

Must-have requirements for this role (the letter's achievement section should speak to these where the candidate's history supports it):
${mustHaveConditions || "None extracted from JD."}

${r.jd_text ? `Job description excerpt:\n${r.jd_text.slice(0, 1200)}` : ""}
${r.clients?.ai_context ? `Client intelligence:\n${r.clients.ai_context}` : ""}`;

  const prompt = `あなたは日系ブティック人材紹介会社のシニアコンサルタントです。クライアント企業に候補者を推薦するための「推薦文」を作成してください。

推薦文は必ず以下の五部構成とし、全体を敬語（謙譲語・丁寧語を適切に使い分ける）で、格式のある文書として書いてください。英語で下書きしてから翻訳するのではなく、最初から自然な日本語のビジネス文書として作成してください。

1. 冒頭の挨拶（クライアントとの関係性への謝辞を含む、格式のある書き出し）
2. 候補者の基本情報（氏名、年齢、現在の状況、入社可能時期、希望年収）
3. 人物像・スキル・実績（具体的な数字を用いて。抽象的な形容詞ではなく実績の数値を示すこと）
4. 転職理由
5. 今後への期待を込めた結び

各パートは PREP（Point → Reason → Example → Point）の構成を意識してください。実績は具体的な数字で語り、面接で裏付けられない誇張は絶対に避けてください。これは候補者が面接で答えに窮する最も典型的な失敗パターンです。

出力は日本語の推薦文の本文のみとしてください。JSON、マークダウンの装飾、見出し記号、説明文は一切不要です。

【候補者情報】
${candidateContext}

【募集ポジション情報】
${roleContext}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1800,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content.find((b) => b.type === "text")?.text.trim() ?? "";
    if (!content) {
      return res.status(200).json({ error: "Could not generate 推薦文. Try again." });
    }

    return res.status(200).json({ content });
  } catch {
    return res.status(200).json({ error: "Could not generate 推薦文. Try again." });
  }
}
