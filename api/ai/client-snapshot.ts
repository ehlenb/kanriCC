import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { clientId, recruiterId } = req.body as {
    clientId: string;
    recruiterId: string;
  };

  if (!clientId || !recruiterId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [{ data: client }, { data: interactions }, { data: reqs }] = await Promise.all([
    supabase
      .from("clients")
      .select("company_name, strategy_notes")
      .eq("id", clientId)
      .single(),
    supabase
      .from("interactions")
      .select("interaction_type, summary, full_notes, interacted_at")
      .eq("client_id", clientId)
      .order("interacted_at", { ascending: false })
      .limit(3),
    supabase
      .from("requisitions")
      .select(`
        title, is_open,
        processes (
          stage,
          candidates ( full_name )
        )
      `)
      .eq("client_id", clientId)
      .eq("is_open", true),
  ]);

  if (!client) return res.status(404).json({ error: "Client not found" });

  // Build active pipeline summary
  const activePipeline = (reqs ?? []).flatMap((r) =>
    ((r.processes as Array<{ stage: string; candidates: { full_name: string } | null }>) ?? [])
      .filter((p) => !["Closed won", "Closed lost"].includes(p.stage))
      .map((p) => `${p.candidates?.full_name ?? "Unknown"} — ${r.title} (${p.stage})`),
  );

  const recentLog = (interactions ?? [])
    .map(
      (i) =>
        `[${i.interaction_type}, ${i.interacted_at?.slice(0, 10)}]: ${i.summary ?? i.full_notes ?? "No notes"}`,
    )
    .join("\n");

  const prompt = `
Client: ${client.company_name}
Strategy notes: ${client.strategy_notes ?? "None"}

Recent interactions (most recent first):
${recentLog || "No interactions logged"}

Active pipeline:
${activePipeline.length > 0 ? activePipeline.join("\n") : "No active processes"}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: `You are a recruitment intelligence assistant supporting a boutique agency recruiter in Japan.
Generate a two-part client snapshot.

Part 1 — "Where things stand" (2–3 sentences max): Summarise the current state of the relationship with this client. What was the most recent interaction? What was agreed or is outstanding? Be specific and factual — if there is no recent interaction, say so.

Part 2 — "Watch out" (1 sentence max): Identify the single most likely thing to go wrong silently if not addressed today. This could be an overdue feedback request, a stalling process, or a relationship risk. Be direct and specific. If nothing is urgent, say "No urgent risk — maintain regular contact."

Format your response as JSON: {"whereThingsStand": "...", "watchOut": "..."}

Rules: Write in clear English suitable for non-native speakers. Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes.`,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";

  try {
    const parsed = JSON.parse(text) as { whereThingsStand?: string; watchOut?: string };
    return res.status(200).json({
      whereThingsStand: parsed.whereThingsStand ?? "",
      watchOut: parsed.watchOut ?? "",
    });
  } catch {
    return res.status(200).json({ whereThingsStand: text, watchOut: "" });
  }
}
