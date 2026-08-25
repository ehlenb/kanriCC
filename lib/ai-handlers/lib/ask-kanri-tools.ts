// Ask Kanri's tool set (Wave 6, piece 1). Every function here is a typed,
// developer-authored query -- never model-authored SQL (CLAUDE.md Section 2's
// SQL-injection rule names this exact surface). Every function takes an
// explicit `teamId`, injected by the handler from the authenticated
// recruiter_id via a `recruiters` lookup, never taken from the model or from
// conversation text.
//
// New threat model versus the rest of the codebase: every existing one-shot
// handler (e.g. handoff-pack.ts) trusts the entity_id it is given because the
// frontend only ever passes an id it already fetched under RLS. Ask Kanri
// breaks that assumption -- the model chooses which tool to call and with
// what argument, across multiple turns. Every query below filters team_id
// explicitly, every time, including single-id lookups (defense in depth) --
// the same fix Wave 5 applied to match-sender.ts's cross-team leak, applied
// here at design time instead of found in an audit.
//
// Read-only. No function here writes anything -- Ask Kanri only answers.

import { createClient } from "@supabase/supabase-js";

import { retrieveCandidateIds } from "./candidate-retrieval.js";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type ToolCallRecord = { tool: string; label: string };

function fmtYen(n: number | null): string {
  return n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";
}

export async function getCandidate(teamId: string, candidateId: string) {
  const { data } = await supabase
    .from("candidates")
    .select(
      "full_name, full_name_japanese, current_company, current_title, japanese_level, english_level, candidate_status, active_passive, expected_total_min, expected_total_max, ai_context",
    )
    .eq("id", candidateId)
    .eq("team_id", teamId)
    .single();
  if (!data) return { found: false as const, record: { tool: "get_candidate", label: "not found" } };
  return {
    found: true as const,
    data,
    record: { tool: "get_candidate", label: data.full_name } as ToolCallRecord,
  };
}

export async function getClient(teamId: string, clientId: string) {
  const { data } = await supabase
    .from("clients")
    .select("company_name, japan_team_size, years_in_japan, strategy_notes, contract_signed, fee_pct, ai_context")
    .eq("id", clientId)
    .eq("team_id", teamId)
    .single();
  if (!data) return { found: false as const, record: { tool: "get_client", label: "not found" } };
  return {
    found: true as const,
    data,
    record: { tool: "get_client", label: data.company_name } as ToolCallRecord,
  };
}

export async function getRequisition(teamId: string, requisitionId: string) {
  const { data } = await supabase
    .from("requisitions")
    .select("title, salary_min, salary_max, salary_range_text, is_open, strategic_context, ai_context, clients!inner ( company_name, team_id )")
    .eq("id", requisitionId)
    .eq("clients.team_id", teamId)
    .single();
  if (!data) return { found: false as const, record: { tool: "get_requisition", label: "not found" } };
  return {
    found: true as const,
    data,
    record: { tool: "get_requisition", label: data.title } as ToolCallRecord,
  };
}

export async function searchCandidates(teamId: string, query: string, status?: string) {
  const statuses = status ? [status] : ["active", "passive"];
  const ids = await retrieveCandidateIds({
    teamId,
    title: query,
    jdText: null,
    strategicContext: null,
    conditions: [],
    statuses,
    excludedIds: [],
    limit: 10,
  });
  if (ids.length === 0) return { results: [], record: { tool: "search_candidates", label: query } as ToolCallRecord };
  const { data } = await supabase
    .from("candidates")
    .select("id, full_name, current_company, current_title, candidate_status")
    .in("id", ids)
    .eq("team_id", teamId);
  return {
    results: data ?? [],
    record: { tool: "search_candidates", label: query } as ToolCallRecord,
  };
}

export async function searchClients(teamId: string, query: string) {
  const { data } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("team_id", teamId)
    .ilike("company_name", `%${query}%`)
    .limit(10);
  return {
    results: data ?? [],
    record: { tool: "search_clients", label: query } as ToolCallRecord,
  };
}

export async function getPipelineSummary(teamId: string, recruiterId: string) {
  const { data } = await supabase
    .from("processes")
    .select("stage, candidates!inner ( team_id )")
    .eq("owner_recruiter_id", recruiterId)
    .eq("candidates.team_id", teamId);

  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);

  return {
    counts: Object.fromEntries(counts),
    record: { tool: "get_pipeline_summary", label: "your pipeline" } as ToolCallRecord,
  };
}

export async function getClientScorecard(teamId: string, clientId: string) {
  const { data: client } = await supabase
    .from("clients")
    .select("company_name")
    .eq("id", clientId)
    .eq("team_id", teamId)
    .single();
  if (!client) return { found: false as const, record: { tool: "get_client_scorecard", label: "not found" } };

  const { data: processes } = await supabase
    .from("processes")
    .select("stage, closed_reason_category, placed_fee_jpy, requisitions!inner ( client_id )")
    .eq("requisitions.client_id", clientId);

  const rows = processes ?? [];
  const placed = rows.filter((r) => r.stage === "Placed");
  const closedLost = rows.filter((r) => r.stage === "Closed lost");
  const totalFees = placed.reduce((sum, r) => sum + (r.placed_fee_jpy ?? 0), 0);

  return {
    found: true as const,
    data: {
      company_name: client.company_name,
      placements: placed.length,
      total_fees: fmtYen(totalFees || null),
      closed_lost: closedLost.length,
      closed_lost_reasons:
        closedLost.length >= 3
          ? Object.entries(
              closedLost.reduce((acc: Record<string, number>, r) => {
                const k = r.closed_reason_category ?? "other";
                acc[k] = (acc[k] ?? 0) + 1;
                return acc;
              }, {}),
            )
          : "not enough closed-lost history yet (n < 3) to show a pattern",
    },
    record: { tool: "get_client_scorecard", label: client.company_name } as ToolCallRecord,
  };
}

export async function getOutcomeStats(teamId: string, clientId?: string) {
  let query = supabase
    .from("processes")
    .select("stage, closed_reason_category, ccm_outcome, requisitions!inner ( client_id, clients!inner ( team_id ) )")
    .eq("requisitions.clients.team_id", teamId);
  if (clientId) query = query.eq("requisitions.client_id", clientId);
  const { data } = await query;

  const rows = data ?? [];
  return {
    placed: rows.filter((r) => r.stage === "Placed").length,
    closed_lost: rows.filter((r) => r.stage === "Closed lost").length,
    ccm_pass: rows.filter((r) => r.ccm_outcome === "pass").length,
    ccm_fail: rows.filter((r) => r.ccm_outcome === "fail").length,
    record: { tool: "get_outcome_stats", label: clientId ?? "team-wide" } as ToolCallRecord,
  };
}

export async function listPriorityActions(teamId: string, recruiterId: string) {
  const { data } = await supabase
    .from("priority_action_state")
    .select("entity_id, action_type, status")
    .eq("recruiter_id", recruiterId)
    .eq("team_id", teamId)
    .eq("status", "snoozed");
  return {
    snoozed_count: (data ?? []).length,
    record: { tool: "list_priority_actions", label: "today's queue" } as ToolCallRecord,
  };
}
