import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidate_id, meeting_url, recruiter_id } = req.body as {
    candidate_id?: string;
    meeting_url?: string;
    recruiter_id?: string;
  };

  if (!candidate_id || !meeting_url || !recruiter_id) {
    return res.status(400).json({ error: "candidate_id, meeting_url, and recruiter_id are required" });
  }

  const recallKey = process.env.RECALL_API_KEY;
  if (!recallKey) return res.status(500).json({ error: "RECALL_API_KEY not configured" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Resolve recruiter's team_id
  const { data: recruiter } = await supabase
    .from("recruiters")
    .select("team_id")
    .eq("id", recruiter_id)
    .single();

  if (!recruiter) return res.status(400).json({ error: "Recruiter not found" });

  // Create bot via Recall.ai API
  const recallRes = await fetch("https://us-west-2.recall.ai/api/v1/bot/", {
    method: "POST",
    headers: {
      Authorization: `Token ${recallKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      meeting_url,
      transcription_options: { provider: "assembly_ai" },
      webhook_url: `${process.env.APP_URL ?? "https://kanri.vercel.app"}/api/webhooks/recall`,
    }),
  });

  if (!recallRes.ok) {
    const err = await recallRes.text();
    console.error("Recall.ai bot creation failed:", err);
    return res.json({ error: "Could not invite note-taker. Check the meeting URL and try again." });
  }

  const bot = (await recallRes.json()) as { id: string };

  // Store session in Supabase
  const { error: insertErr } = await supabase.from("recall_bot_sessions").insert({
    bot_id: bot.id,
    candidate_id,
    recruiter_id,
    team_id: recruiter.team_id,
    meeting_url,
    status: "invited",
  });

  if (insertErr) {
    console.error("recall_bot_sessions insert error:", insertErr);
    return res.json({ error: "Bot invited but session could not be saved." });
  }

  return res.json({ data: { bot_id: bot.id, status: "invited" } });
}
