import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function businessDaysSince(isoDate: string): number {
  const start = new Date(isoDate);
  const end = new Date();
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function daysSince(isoDate: string | null): number {
  if (!isoDate) return 9999;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recruiter_id } = req.body as { recruiter_id: string };
  if (!recruiter_id) return res.status(400).json({ error: "recruiter_id is required" });

  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const [{ data: processes }, { data: placedCandidates }, { data: openClients }, { data: coldCandidates }] =
    await Promise.all([
      supabase
        .from("processes")
        .select(
          "id, stage, last_activity_at, cv_sent_at, offer_date, buy_in_confirmed_at, candidate_id, requisition_id, candidates ( full_name, last_interaction_at ), requisitions ( title, is_open )",
        )
        .eq("owner_recruiter_id", recruiter_id),
      supabase
        .from("candidates")
        .select("id, full_name, placement_guarantee_until, last_interaction_at")
        .eq("recruiter_id", recruiter_id)
        .eq("candidate_status", "placed")
        .gt("placement_guarantee_until", now),
      supabase
        .from("clients")
        .select("id, company_name")
        .eq("recruiter_id", recruiter_id)
        .in(
          "id",
          (
            await supabase
              .from("requisitions")
              .select("client_id")
              .eq("recruiter_id", recruiter_id)
              .eq("is_open", true)
          ).data?.map((r: { client_id: string }) => r.client_id) ?? [],
        ),
      supabase
        .from("candidates")
        .select("id, full_name, last_interaction_at, candidate_status")
        .eq("recruiter_id", recruiter_id)
        .eq("candidate_status", "active")
        .lt("last_interaction_at", thirtyDaysAgo),
    ]);

  type AgendaItem = {
    entity_type: "candidate" | "client";
    entity_id: string;
    entity_name: string;
    process_id?: string;
    stage?: string;
    priority_rank: number;
    flag_reason: string;
  };

  const flagged: AgendaItem[] = [];

  for (const proc of processes ?? []) {
    const p = proc as {
      id: string;
      stage: string;
      last_activity_at: string | null;
      cv_sent_at: string | null;
      offer_date: string | null;
      buy_in_confirmed_at: string | null;
      candidate_id: string;
      requisition_id: string;
      candidates: { full_name: string; last_interaction_at: string | null } | null;
      requisitions: { title: string; is_open: boolean } | null;
    };

    if (!p.requisitions?.is_open) continue;
    const name = p.candidates?.full_name ?? "Unknown";
    const ds = daysSince(p.last_activity_at);

    if (p.stage === "Offer" && ds >= 2) {
      flagged.push({ entity_type: "candidate", entity_id: p.candidate_id, entity_name: name, process_id: p.id, stage: p.stage, priority_rank: 1, flag_reason: `Offer made ${ds} days ago with no recent activity` });
    } else if (/^CCM\d+$/.test(p.stage) && ds >= 2) {
      flagged.push({ entity_type: "candidate", entity_id: p.candidate_id, entity_name: name, process_id: p.id, stage: p.stage, priority_rank: 3, flag_reason: `${p.stage} feedback pending — ${ds} days since last activity` });
    } else if (p.stage === "CV Sent" && p.cv_sent_at && businessDaysSince(p.cv_sent_at) >= 5) {
      const lastInbound = p.candidates?.last_interaction_at;
      if (!lastInbound || new Date(lastInbound) < new Date(p.cv_sent_at)) {
        flagged.push({ entity_type: "candidate", entity_id: p.candidate_id, entity_name: name, process_id: p.id, stage: p.stage, priority_rank: 4, flag_reason: `CV sent ${businessDaysSince(p.cv_sent_at)} business days ago — no client response yet` });
      }
    } else if (p.stage === "Buy-In" && !p.buy_in_confirmed_at && ds >= 7) {
      flagged.push({ entity_type: "candidate", entity_id: p.candidate_id, entity_name: name, process_id: p.id, stage: p.stage, priority_rank: 5, flag_reason: `Buy-in not confirmed — ${ds} days since last activity` });
    } else if (p.stage === "Specs Sent" && ds >= 5) {
      flagged.push({ entity_type: "candidate", entity_id: p.candidate_id, entity_name: name, process_id: p.id, stage: p.stage, priority_rank: 6, flag_reason: `Specs sent ${ds} days ago — follow up needed` });
    }
  }

  for (const cand of placedCandidates ?? []) {
    const c = cand as { id: string; full_name: string; placement_guarantee_until: string; last_interaction_at: string | null };
    const ds = daysSince(c.last_interaction_at);
    if (ds >= 14) {
      flagged.push({ entity_type: "candidate", entity_id: c.id, entity_name: c.full_name, priority_rank: 2, flag_reason: `Placed — guarantee period active. Last touch ${ds} days ago` });
    }
  }

  for (const client of openClients ?? []) {
    const cl = client as { id: string; company_name: string };
    const { data: lastInteraction } = await supabase
      .from("interactions")
      .select("interacted_at")
      .eq("client_id", cl.id)
      .order("interacted_at", { ascending: false })
      .limit(1)
      .single();

    const ds = daysSince(lastInteraction?.interacted_at ?? null);
    if (ds >= 14) {
      flagged.push({ entity_type: "client", entity_id: cl.id, entity_name: cl.company_name, priority_rank: 7, flag_reason: `Open requisition — no client interaction in ${ds} days` });
    }
  }

  for (const cand of coldCandidates ?? []) {
    const c = cand as { id: string; full_name: string; last_interaction_at: string | null };
    const ds = daysSince(c.last_interaction_at);
    flagged.push({ entity_type: "candidate", entity_id: c.id, entity_name: c.full_name, priority_rank: 8, flag_reason: `Active candidate — no interaction in ${ds} days` });
  }

  // Sort by priority_rank then days overdue (highest first within rank)
  flagged.sort((a, b) => a.priority_rank - b.priority_rank);

  if (flagged.length === 0) {
    return res.status(200).json({ agenda: [] });
  }

  const prompt = flagged.slice(0, 25).map((item, i) =>
    `${i + 1}. [${item.entity_type.toUpperCase()}] ${item.entity_name}${item.stage ? ` — ${item.stage}` : ""}\nReason: ${item.flag_reason}`,
  ).join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    system: `You are generating a daily agenda for a recruiter in Japan. For each item, write:
- reason: one plain English sentence explaining why this is flagged today.
- suggested_action: one sentence — what to do next.
- action_type: one of: open_briefing | draft_email | open_process | open_client

Return valid JSON only — no markdown fences:
{
  "items": [
    {
      "index": number,
      "reason": string,
      "suggested_action": string,
      "action_type": "open_briefing" | "draft_email" | "open_process" | "open_client"
    }
  ]
}

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short sentences.`,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const aiOutput = JSON.parse(cleaned) as { items: Array<{ index: number; reason: string; suggested_action: string; action_type: string }> };
    const itemMap = new Map(aiOutput.items.map((item) => [item.index, item]));

    const agenda = flagged.slice(0, 25).map((item, i) => {
      const ai = itemMap.get(i + 1);
      return {
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        entity_name: item.entity_name,
        process_id: item.process_id,
        stage: item.stage,
        reason: ai?.reason ?? item.flag_reason,
        suggested_action: ai?.suggested_action ?? "Follow up today.",
        action_type: ai?.action_type ?? "open_process",
        priority_rank: item.priority_rank,
      };
    });

    return res.status(200).json({ agenda });
  } catch {
    // Fallback: return flagged items without AI text
    const agenda = flagged.slice(0, 25).map((item) => ({
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      entity_name: item.entity_name,
      process_id: item.process_id,
      stage: item.stage,
      reason: item.flag_reason,
      suggested_action: "Follow up today.",
      action_type: "open_process",
      priority_rank: item.priority_rank,
    }));
    return res.status(200).json({ agenda });
  }
}
