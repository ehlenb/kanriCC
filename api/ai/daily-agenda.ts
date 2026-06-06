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

function hoursSince(isoDate: string | null): number {
  if (!isoDate) return 9999;
  return (Date.now() - new Date(isoDate).getTime()) / 3600000;
}

// Higher CCM number = closer to offer = higher urgency = lower priority_rank value
function ccmPriorityRank(stage: string): number {
  const n = parseInt(stage.replace("CCM", ""), 10);
  if (isNaN(n)) return 30;
  // CCM1 → rank 25, CCM2 → rank 20, CCM3 → rank 15, CCM4+ → rank 12
  return Math.max(12, 30 - n * 5);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recruiter_id } = req.body as { recruiter_id: string };
  if (!recruiter_id) return res.status(400).json({ error: "recruiter_id is required" });

  const now = new Date().toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();

  const [
    { data: processes },
    { data: placedCandidates },
    { data: openClients },
    { data: newRequisitions },
  ] = await Promise.all([
    supabase
      .from("processes")
      .select(
        "id, stage, last_activity_at, cv_sent_at, offer_date, buy_in_confirmed_at, candidate_id, requisition_id, candidates ( full_name, last_interaction_at ), requisitions ( title, is_open, clients ( company_name ) )",
      )
      .eq("owner_recruiter_id", recruiter_id)
      .not("stage", "in", '("Closed lost","Placed")'),
    supabase
      .from("candidates")
      .select("id, full_name, placement_guarantee_until, last_interaction_at")
      .eq("recruiter_id", recruiter_id)
      .eq("candidate_status", "placed")
      .gt("placement_guarantee_until", now),
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("recruiter_id", recruiter_id),
    supabase
      .from("requisitions")
      .select("id, title, created_at, clients ( company_name )")
      .eq("owner_recruiter_id", recruiter_id)
      .eq("is_open", true)
      .gte("created_at", twentyFourHoursAgo),
  ]);

  type AgendaItem = {
    entity_type: "candidate" | "client" | "requisition";
    entity_id: string;
    entity_name: string;
    process_id?: string;
    stage?: string;
    priority_rank: number;
    flag_reason: string;
  };

  const flagged: AgendaItem[] = [];

  // ── 1. New requisitions < 24h — act before competitors do ────────────────────
  for (const req of newRequisitions ?? []) {
    const r = req as {
      id: string;
      title: string;
      created_at: string;
      clients: { company_name: string } | null;
    };
    const hrs = hoursSince(r.created_at);
    flagged.push({
      entity_type: "requisition",
      entity_id: r.id,
      entity_name: `${r.clients?.company_name ?? "Client"} — ${r.title}`,
      priority_rank: 5, // high but just below active offer-stage candidates
      flag_reason: `New job spec received ${Math.round(hrs)}h ago. Speed is critical — start sourcing and job speccing candidates now before competing agencies do.`,
    });
  }

  // ── 2. Active pipeline processes ─────────────────────────────────────────────
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
      requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
    };

    if (!p.requisitions?.is_open) continue;
    const name = p.candidates?.full_name ?? "Unknown";
    const clientName = p.requisitions?.clients?.company_name ?? "";
    const roleTitle = p.requisitions?.title ?? "";
    const ds = daysSince(p.last_activity_at ?? p.candidates?.last_interaction_at ?? null);
    const bds = p.last_activity_at ? businessDaysSince(p.last_activity_at) : 99;
    const context = clientName ? ` for ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";

    if (p.stage === "Offer") {
      flagged.push({
        entity_type: "candidate",
        entity_id: p.candidate_id,
        entity_name: name,
        process_id: p.id,
        stage: p.stage,
        priority_rank: 1, // always top
        flag_reason: `Offer stage${context}. ${ds >= 2 ? `${ds} days since last activity — candidate may be comparing offers.` : "Active offer — keep the momentum and close."}`,
      });
    } else if (/^CCM\d+$/.test(p.stage)) {
      const rank = ccmPriorityRank(p.stage);
      flagged.push({
        entity_type: "candidate",
        entity_id: p.candidate_id,
        entity_name: name,
        process_id: p.id,
        stage: p.stage,
        priority_rank: rank,
        flag_reason: `${p.stage}${context}. ${bds >= 5 ? `No activity in ${bds} business days — follow up on feedback urgently.` : "Actively interviewing — prepare candidate and check in."}`,
      });
    } else if (p.stage === "Buy-In" && !p.buy_in_confirmed_at && ds >= 7) {
      flagged.push({
        entity_type: "candidate",
        entity_id: p.candidate_id,
        entity_name: name,
        process_id: p.id,
        stage: p.stage,
        priority_rank: 40,
        flag_reason: `Buy-in not confirmed${context} — ${ds} days since last activity. Risk of losing candidate's consent.`,
      });
    } else if (p.stage === "CV Sent" && p.cv_sent_at && businessDaysSince(p.cv_sent_at) >= 5) {
      const lastInbound = p.candidates?.last_interaction_at;
      if (!lastInbound || new Date(lastInbound) < new Date(p.cv_sent_at)) {
        flagged.push({
          entity_type: "candidate",
          entity_id: p.candidate_id,
          entity_name: name,
          process_id: p.id,
          stage: p.stage,
          priority_rank: 50,
          flag_reason: `CV sent ${businessDaysSince(p.cv_sent_at)} business days ago to ${clientName || "client"} — no response yet. Chase the client.`,
        });
      }
    } else if (p.stage === "Specs Sent" && ds >= 5) {
      flagged.push({
        entity_type: "candidate",
        entity_id: p.candidate_id,
        entity_name: name,
        process_id: p.id,
        stage: p.stage,
        priority_rank: 60,
        flag_reason: `Specs sent ${ds} days ago${context} — follow up to confirm receipt and gauge interest.`,
      });
    }
  }

  // ── 3. Placed candidates in guarantee period ──────────────────────────────────
  for (const cand of placedCandidates ?? []) {
    const c = cand as { id: string; full_name: string; placement_guarantee_until: string; last_interaction_at: string | null };
    const ds = daysSince(c.last_interaction_at);
    if (ds >= 14) {
      flagged.push({
        entity_type: "candidate",
        entity_id: c.id,
        entity_name: c.full_name,
        priority_rank: 35,
        flag_reason: `Placed — guarantee period active. Last touch ${ds} days ago. Check in to protect the placement.`,
      });
    }
  }

  // ── 4. Clients with open reqs and no recent interaction ───────────────────────
  const clientList = (openClients ?? []) as { id: string; company_name: string }[];
  if (clientList.length > 0) {
    const clientIds = clientList.map((cl) => cl.id);
    const { data: clientInteractions } = await supabase
      .from("interactions")
      .select("client_id, interacted_at")
      .in("client_id", clientIds)
      .order("interacted_at", { ascending: false });

    const latestByClient = new Map<string, string>();
    for (const row of (clientInteractions ?? []) as { client_id: string; interacted_at: string }[]) {
      if (!latestByClient.has(row.client_id)) latestByClient.set(row.client_id, row.interacted_at);
    }

    for (const cl of clientList) {
      const ds = daysSince(latestByClient.get(cl.id) ?? null);
      if (ds >= 14) {
        flagged.push({
          entity_type: "client",
          entity_id: cl.id,
          entity_name: cl.company_name,
          priority_rank: 70,
          flag_reason: `Open requisition — no client interaction in ${ds} days. Relationship may be going cold.`,
        });
      }
    }
  }

  // Sort by priority_rank
  flagged.sort((a, b) => a.priority_rank - b.priority_rank);

  if (flagged.length === 0) {
    return res.status(200).json({ agenda: [] });
  }

  // ── AI ranking pass ────────────────────────────────────────────────────────────
  const itemLines = flagged.slice(0, 25).map((item, i) =>
    `${i + 1}. [${item.entity_type.toUpperCase()}] ${item.entity_name}${item.stage ? ` — ${item.stage}` : ""}\n   Reason: ${item.flag_reason}`,
  ).join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1800,
    system: `You are a senior recruiter advisor helping a Japan-market agency recruiter prioritize their day.

You will receive a list of pipeline items that need attention. Each has a flag reason.

Your job: For each item, write a short, specific, direct action for the recruiter.
- reason: one plain English sentence. Direct. No fluff. Says WHY it is urgent today specifically.
- suggested_action: one sentence. Concrete. What to do in the next hour.
- action_type: open_briefing | draft_email | open_process | open_client | open_requisition

Priority context:
- Offer stage candidates always come first
- New job specs under 24h are urgent — competing agencies have the same brief
- Higher CCM round = closer to offer = more urgent
- Stale processes (5+ business days no contact) need immediate follow-up
- Speed in recruitment is everything. Be direct about the cost of delay.

Return valid JSON only. No markdown fences. No commentary.
{
  "items": [
    {
      "index": number,
      "reason": string,
      "suggested_action": string,
      "action_type": "open_briefing" | "draft_email" | "open_process" | "open_client" | "open_requisition"
    }
  ]
}

NEVER use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes. Short sentences.`,
    messages: [{ role: "user", content: itemLines }],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const aiOutput = JSON.parse(cleaned) as {
      items: Array<{ index: number; reason: string; suggested_action: string; action_type: string }>;
    };
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
