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

// Higher CCM = closer to offer = lower rank number = shown first
function ccmPriorityRank(stage: string): number {
  const n = parseInt(stage.replace("CCM", ""), 10);
  if (isNaN(n)) return 30;
  return Math.max(12, 30 - n * 5); // CCM1→25, CCM2→20, CCM3→15, CCM4+→12
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recruiter_id } = req.body as { recruiter_id: string };
  if (!recruiter_id) return res.status(400).json({ error: "recruiter_id is required" });

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();

  const [
    { data: processes },
    { data: newRequisitions },
    { data: openClients },
  ] = await Promise.all([
    // All active processes owned by this recruiter
    supabase
      .from("processes")
      .select(
        "id, stage, last_activity_at, cv_sent_at, offer_date, buy_in_confirmed_at, not_interested_at, start_date, candidate_id, requisition_id, candidates ( full_name, full_name_japanese, last_interaction_at ), requisitions ( title, is_open, clients ( company_name ) )",
      )
      .eq("owner_recruiter_id", recruiter_id)
      .not("stage", "in", '("Closed lost")'),

    // New job specs in the last 24h
    supabase
      .from("requisitions")
      .select("id, title, created_at, client_id, clients ( company_name )")
      .eq("owner_recruiter_id", recruiter_id)
      .eq("is_open", true)
      .gte("created_at", twentyFourHoursAgo),

    // All clients with open reqs (for staleness check)
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("recruiter_id", recruiter_id),
  ]);

  type AgendaItem = {
    entity_type: "candidate" | "client" | "requisition";
    entity_id: string;
    entity_name: string;
    process_id?: string;
    stage?: string;
    priority_rank: number;
    flag_reason: string;
    client_id?: string;
  };

  const flagged: AgendaItem[] = [];

  // ── PRIORITY 1: Offer stage ───────────────────────────────────────────────────
  // Any candidate at Offer — highest urgency, candidates compare offers quickly
  for (const proc of processes ?? []) {
    const p = proc as {
      id: string;
      stage: string;
      last_activity_at: string | null;
      cv_sent_at: string | null;
      offer_date: string | null;
      buy_in_confirmed_at: string | null;
      not_interested_at: string | null;
      start_date: string | null;
      candidate_id: string;
      requisition_id: string;
      candidates: { full_name: string; full_name_japanese: string | null; last_interaction_at: string | null } | null;
      requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
    };

    if (p.stage !== "Offer") continue;
    if (!p.requisitions?.is_open) continue;

    const name = p.candidates?.full_name ?? "Unknown";
    const clientName = p.requisitions?.clients?.company_name ?? "";
    const roleTitle = p.requisitions?.title ?? "";
    const ds = daysSince(p.last_activity_at ?? p.candidates?.last_interaction_at ?? null);
    const context = clientName ? ` for ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";

    flagged.push({
      entity_type: "candidate",
      entity_id: p.candidate_id,
      entity_name: name,
      process_id: p.id,
      stage: p.stage,
      priority_rank: 1,
      flag_reason: `Offer stage${context}. ${ds >= 2 ? `${ds} days since last activity — candidate may be weighing other offers.` : "Active offer — maintain momentum and close."}`,
    });
  }

  // ── PRIORITY 2: Final interview feedback pending (CCM + call/meeting logged + no follow-up 24h) ──
  // Check interactions for each CCM process to see if feedback follow-up is overdue
  const ccmProcesses = (processes ?? []).filter((proc) => {
    const p = proc as { stage: string; requisitions: { is_open: boolean } | null };
    return /^CCM\d+$/.test(p.stage) && p.requisitions?.is_open;
  });

  if (ccmProcesses.length > 0) {
    const ccmProcessIds = ccmProcesses.map((p) => (p as { id: string }).id);

    // Get the most recent interaction per process to check for pending feedback
    const { data: ccmInteractions } = await supabase
      .from("interactions")
      .select("process_id, interaction_type, interacted_at, primary_party")
      .in("process_id", ccmProcessIds)
      .in("interaction_type", ["call", "meeting", "interview scheduled"])
      .order("interacted_at", { ascending: false });

    const lastInterviewInteractionByProcess = new Map<string, { interacted_at: string; primary_party: string | null }>();
    for (const row of (ccmInteractions ?? []) as { process_id: string | null; interaction_type: string; interacted_at: string; primary_party: string | null }[]) {
      if (row.process_id && !lastInterviewInteractionByProcess.has(row.process_id)) {
        lastInterviewInteractionByProcess.set(row.process_id, {
          interacted_at: row.interacted_at,
          primary_party: row.primary_party,
        });
      }
    }

    for (const proc of ccmProcesses) {
      const p = proc as {
        id: string;
        stage: string;
        last_activity_at: string | null;
        candidate_id: string;
        candidates: { full_name: string; last_interaction_at: string | null } | null;
        requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
      };

      const name = p.candidates?.full_name ?? "Unknown";
      const clientName = p.requisitions?.clients?.company_name ?? "";
      const roleTitle = p.requisitions?.title ?? "";
      const context = clientName ? ` for ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";
      const rank = ccmPriorityRank(p.stage);

      const lastInteraction = lastInterviewInteractionByProcess.get(p.id);
      const bds = p.last_activity_at ? businessDaysSince(p.last_activity_at) : 99;

      // Feedback pending: interview was logged but no follow-up call/email in 24h
      if (lastInteraction && hoursSince(lastInteraction.interacted_at) >= 24) {
        const hoursAgo = Math.round(hoursSince(lastInteraction.interacted_at));
        const party = lastInteraction.primary_party === "client" ? "client" : "candidate";
        flagged.push({
          entity_type: "candidate",
          entity_id: p.candidate_id,
          entity_name: name,
          process_id: p.id,
          stage: p.stage,
          priority_rank: rank,
          flag_reason: `${p.stage}${context}. Interview with ${party} logged ${hoursAgo}h ago — feedback not yet followed up. Get feedback from both sides before it goes cold.`,
        });
      } else if (!lastInteraction && bds >= 3) {
        // No interview interaction logged at all but process is stale
        flagged.push({
          entity_type: "candidate",
          entity_id: p.candidate_id,
          entity_name: name,
          process_id: p.id,
          stage: p.stage,
          priority_rank: rank,
          flag_reason: `${p.stage}${context}. No interview activity logged in ${bds} business days — follow up on the interview status urgently.`,
        });
      }
    }
  }

  // ── PRIORITY 3: New job specs < 24h — speed is everything ──────────────────────
  for (const req of newRequisitions ?? []) {
    const r = req as {
      id: string;
      title: string;
      created_at: string;
      client_id: string | null;
      clients: { company_name: string } | null;
    };
    const hrs = Math.round(hoursSince(r.created_at));
    flagged.push({
      entity_type: "requisition",
      entity_id: r.id,
      entity_name: `${r.clients?.company_name ?? "Client"} — ${r.title}`,
      priority_rank: 5,
      flag_reason: `New job spec received ${hrs}h ago. Speed is critical — identify and spec matched active candidates before competing agencies do.`,
      ...(r.client_id ? { client_id: r.client_id } : {}),
    });
  }

  // ── PRIORITY 4: Buy-in confirmed, CV not yet sent ──────────────────────────────
  for (const proc of processes ?? []) {
    const p = proc as {
      id: string;
      stage: string;
      cv_sent_at: string | null;
      buy_in_confirmed_at: string | null;
      not_interested_at: string | null;
      candidate_id: string;
      candidates: { full_name: string; last_interaction_at: string | null } | null;
      requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
    };

    if (p.stage !== "Buy-In") continue;
    if (!p.requisitions?.is_open) continue;
    if (!p.buy_in_confirmed_at) continue; // buy-in not yet confirmed — handled in priority 6
    if (p.cv_sent_at) continue; // CV already sent
    if (p.not_interested_at) continue; // candidate declined

    const name = p.candidates?.full_name ?? "Unknown";
    const clientName = p.requisitions?.clients?.company_name ?? "";
    const roleTitle = p.requisitions?.title ?? "";
    const context = clientName ? ` for ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";
    const ds = daysSince(p.buy_in_confirmed_at);

    flagged.push({
      entity_type: "candidate",
      entity_id: p.candidate_id,
      entity_name: name,
      process_id: p.id,
      stage: p.stage,
      priority_rank: 8,
      flag_reason: `Buy-in confirmed${context} — CV not sent yet${ds >= 1 ? ` (${ds} days since buy-in)` : ""}. Send the CV or soft-reject the candidate for this role.`,
    });
  }

  // ── PRIORITY 5: CV sent, no client response after 3 business days ──────────────
  for (const proc of processes ?? []) {
    const p = proc as {
      id: string;
      stage: string;
      cv_sent_at: string | null;
      candidate_id: string;
      candidates: { full_name: string; last_interaction_at: string | null } | null;
      requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
    };

    if (p.stage !== "CV Sent") continue;
    if (!p.requisitions?.is_open) continue;
    if (!p.cv_sent_at) continue;

    const bds = businessDaysSince(p.cv_sent_at);
    if (bds < 3) continue;

    const name = p.candidates?.full_name ?? "Unknown";
    const clientName = p.requisitions?.clients?.company_name ?? "";
    const roleTitle = p.requisitions?.title ?? "";
    const context = clientName ? ` to ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";

    flagged.push({
      entity_type: "candidate",
      entity_id: p.candidate_id,
      entity_name: name,
      process_id: p.id,
      stage: p.stage,
      priority_rank: 20,
      flag_reason: `CV sent${context} — no client response in ${bds} business days. Chase the client for feedback.`,
    });
  }

  // ── PRIORITY 6: Buy-in not confirmed, high-fit candidate (7+ days no activity) ─
  for (const proc of processes ?? []) {
    const p = proc as {
      id: string;
      stage: string;
      last_activity_at: string | null;
      buy_in_confirmed_at: string | null;
      not_interested_at: string | null;
      candidate_id: string;
      candidates: { full_name: string; last_interaction_at: string | null } | null;
      requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
    };

    if (p.stage !== "Buy-In") continue;
    if (!p.requisitions?.is_open) continue;
    if (p.buy_in_confirmed_at) continue; // already confirmed — covered in priority 4
    if (p.not_interested_at) continue; // declined

    const ds = daysSince(p.last_activity_at ?? p.candidates?.last_interaction_at ?? null);
    if (ds < 7) continue;

    const name = p.candidates?.full_name ?? "Unknown";
    const clientName = p.requisitions?.clients?.company_name ?? "";
    const roleTitle = p.requisitions?.title ?? "";
    const context = clientName ? ` for ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";

    flagged.push({
      entity_type: "candidate",
      entity_id: p.candidate_id,
      entity_name: name,
      process_id: p.id,
      stage: p.stage,
      priority_rank: 40,
      flag_reason: `Buy-in not confirmed${context} — ${ds} days since last activity. Re-engage to confirm consent before the window closes.`,
    });
  }

  // ── PRIORITY 7: Placed candidates — guarantee cadence check ──────────────────
  // Milestones: 2 weeks, 1 month, 3 months after start_date
  for (const proc of processes ?? []) {
    const p = proc as {
      id: string;
      stage: string;
      start_date: string | null;
      last_activity_at: string | null;
      candidate_id: string;
      candidates: { full_name: string; last_interaction_at: string | null } | null;
      requisitions: { title: string; is_open: boolean; clients: { company_name: string } | null } | null;
    };

    if (p.stage !== "Placed") continue;
    if (!p.start_date) continue;

    const startMs = new Date(p.start_date).getTime();
    const nowMs = Date.now();
    const daysSinceStart = Math.floor((nowMs - startMs) / 86400000);
    const lastTouch = daysSince(p.last_activity_at ?? p.candidates?.last_interaction_at ?? null);

    // Check if we're past a cadence milestone and haven't checked in recently
    const milestones = [
      { days: 14, label: "2-week" },
      { days: 30, label: "1-month" },
      { days: 90, label: "3-month" },
    ];

    for (const milestone of milestones) {
      if (daysSinceStart >= milestone.days && daysSinceStart < milestone.days + 14 && lastTouch >= 7) {
        const name = p.candidates?.full_name ?? "Unknown";
        const clientName = p.requisitions?.clients?.company_name ?? "";
        const roleTitle = p.requisitions?.title ?? "";
        const context = clientName ? ` at ${clientName}${roleTitle ? ` — ${roleTitle}` : ""}` : "";

        flagged.push({
          entity_type: "candidate",
          entity_id: p.candidate_id,
          entity_name: name,
          process_id: p.id,
          stage: p.stage,
          priority_rank: 50,
          flag_reason: `Placed${context} — ${milestone.label} check-in due. Started ${daysSinceStart} days ago. Last contact ${lastTouch} days ago. Check in to protect the placement guarantee.`,
        });
        break; // Only flag once per process
      }
    }
  }

  // ── PRIORITY 8: Clients with open reqs and no interaction in 10+ business days ─
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

    // Check which clients actually have open reqs
    const { data: openReqClients } = await supabase
      .from("requisitions")
      .select("client_id")
      .eq("owner_recruiter_id", recruiter_id)
      .eq("is_open", true);

    const clientsWithOpenReqs = new Set(
      (openReqClients ?? []).map((r) => (r as { client_id: string }).client_id),
    );

    for (const cl of clientList) {
      if (!clientsWithOpenReqs.has(cl.id)) continue;
      const lastInteracted = latestByClient.get(cl.id) ?? null;
      const bds = lastInteracted ? businessDaysSince(lastInteracted) : 999;
      if (bds < 10) continue;

      flagged.push({
        entity_type: "client",
        entity_id: cl.id,
        entity_name: cl.company_name,
        priority_rank: 70,
        flag_reason: `Open requisition at ${cl.company_name} — no interaction in ${bds} business days. Relationship may be going cold; check in to show activity.`,
      });
    }
  }

  // Sort by priority_rank (lowest = most urgent)
  flagged.sort((a, b) => a.priority_rank - b.priority_rank);

  if (flagged.length === 0) {
    return res.status(200).json({ agenda: [] });
  }

  // ── AI pass — enrich with specific next actions ────────────────────────────────
  const itemLines = flagged.slice(0, 25).map((item, i) =>
    `${i + 1}. [${item.entity_type.toUpperCase()}] ${item.entity_name}${item.stage ? ` — ${item.stage}` : ""}\n   Reason: ${item.flag_reason}`,
  ).join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1800,
    system: `You are a senior recruiter advisor helping a Japan-market agency recruiter prioritize their day.

You will receive a list of pipeline items that need attention. Each has a flag reason.

Your job: For each item, write a short, specific, direct action for the recruiter.
- reason: one plain English sentence. Direct. No fluff. Says WHY it is urgent today.
- suggested_action: one sentence. Concrete. What to do in the next hour.
- action_type: open_briefing | draft_email | open_process | open_client | open_requisition

Priority context:
- Offer stage candidates always come first — every day of delay is a risk
- Final interview feedback: get it from both candidate and client within 24h or the momentum is lost
- New job specs under 24h: speed is the edge — competing agencies have the same brief
- Buy-in confirmed, CV not sent: every day you wait is a day the candidate cools
- CV sent with no client response at 3 business days: chase the client, not tomorrow
- Buy-in not confirmed at 7 days: re-engage or close the process
- Placed candidates at milestone check-ins: protecting the guarantee is protecting the fee
- Stale client relationships: open reqs with no contact go cold fast in Japan

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
