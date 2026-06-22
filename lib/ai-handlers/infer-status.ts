import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(200).json({ error: "Method not allowed" });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString();

  // 1. Auto-revert: Placed → Passive after 90 days (status_source stays as-is;
  //    this is a time-based rule, not an AI decision)
  await supabase
    .from("candidates")
    .update({ candidate_status: "passive" })
    .eq("candidate_status", "placed")
    .lt("placed_at", ninetyDaysAgo);

  // 2. Fetch candidates eligible for AI inference (not manually overridden)
  const { data: candidates, error: fetchError } = await supabase
    .from("candidates")
    .select("id, candidate_status, last_interaction_at, full_name")
    .eq("status_source", "ai_inferred")
    .neq("candidate_status", "placed");

  if (fetchError) return res.status(200).json({ error: fetchError.message });
  if (!candidates || candidates.length === 0) return res.status(200).json({ updated: 0 });

  // 3. For candidates with no activity in 60+ days, infer passive without AI
  const noActivityIds = candidates
    .filter((c) => !c.last_interaction_at || c.last_interaction_at < sixtyDaysAgo)
    .map((c) => c.id);

  if (noActivityIds.length > 0) {
    await supabase
      .from("candidates")
      .update({ candidate_status: "passive" })
      .in("id", noActivityIds);
  }

  // 4. For candidates with recent activity, use Claude to infer from latest interaction
  const recentCandidates = candidates.filter(
    (c) => c.last_interaction_at && c.last_interaction_at >= sixtyDaysAgo,
  );

  let aiUpdated = 0;

  for (const candidate of recentCandidates) {
    const { data: interactions } = await supabase
      .from("interactions")
      .select("summary, interaction_type, interacted_at")
      .eq("candidate_id", candidate.id)
      .order("interacted_at", { ascending: false })
      .limit(3);

    if (!interactions || interactions.length === 0) continue;

    const interactionText = interactions
      .map((i) => `[${i.interaction_type} on ${i.interacted_at?.slice(0, 10)}] ${i.summary ?? "no summary"}`)
      .join("\n");

    const prompt = `You are assessing whether a job candidate is actively open to new opportunities based on recent recruiter notes.

Recent activity for ${candidate.full_name}:
${interactionText}

Based only on these notes, is this candidate active (open to opportunities) or passive (not currently looking)?

Reply with exactly one word: active or passive.`;

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: prompt }],
      });

      const reply = (message.content[0] as { text: string }).text.trim().toLowerCase();

      if (reply === "passive" && candidate.candidate_status !== "passive") {
        await supabase
          .from("candidates")
          .update({ candidate_status: "passive" })
          .eq("id", candidate.id);
        aiUpdated++;
      } else if (reply === "active" && candidate.candidate_status !== "active") {
        await supabase
          .from("candidates")
          .update({ candidate_status: "active" })
          .eq("id", candidate.id);
        aiUpdated++;
      }
    } catch {
      // Skip this candidate if AI call fails; will retry on next run
    }
  }

  return res.status(200).json({
    reverted_to_passive: noActivityIds.length,
    ai_updated: aiUpdated,
  });
}
