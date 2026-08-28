// Ask Kanri (Wave 6, piece 1) -- one agentic endpoint with read-only database
// tools, replacing the pattern of one one-shot endpoint per recruiter
// question (CLAUDE.md Architecture Rule 2, and named explicitly under the
// SQL-injection rule in Section 2 as the intended future home for this kind
// of surface). First multi-turn tool-use loop in the codebase -- no agent
// framework (Section 22 forbids LangChain/LangGraph/CrewAI), just the direct
// Anthropic SDK tool-use loop, same restraint every other handler already
// shows.
//
// Every tool call is team-scoped server-side from the caller's recruiter_id
// (never from the model or conversation text) -- see ask-kanri-tools.ts for
// why that matters here specifically. No tool writes anything: Ask Kanri only
// answers, never changes stage, logs an interaction, or sends anything
// (Section 8's "never auto-send/act" rule applies to a tool-using agent
// exactly as it does to a one-shot handler).

import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import * as tools from "./lib/ask-kanri-tools.js";
import type { ToolCallRecord } from "./lib/ask-kanri-tools.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `You are Ask Kanri, answering a recruiter's question about their own candidates, clients, requisitions, and pipeline at a boutique Japan-market recruitment agency.

Use the tools to look up real records before answering -- never guess or invent a name, number, or status. If a tool returns nothing, say so plainly rather than filling the gap.

Be direct. Plain English, short sentences. No preamble like "Let me check" or "Based on the data". Never use these words: straightforward, genuinely, honestly, leverage (as a verb), utilize.

Write in plain text, the way you would type a message to a colleague. No Markdown: no ** or __ for bold, no # headings, no backticks, no em dashes. A short numbered list is fine when it genuinely helps a ranking or comparison, but keep names and emphasis in plain prose, never wrapped in asterisks.

If a question is about something a candidate or client actually said (a call, an email, a meeting), use search_interactions rather than guessing from a profile summary -- it searches the real notes, not a reconciled summary. Cite the date when you answer from it.

For a question that asks which or what roles or candidates, or that ranks or prioritises the pipeline, call list_pipeline and answer from the individual items. Name the specific roles and candidates. When a question sets a time window such as this quarter or this month, reason about it directly: an offer already out can close within a quarter, a candidate at an early stage or on a long notice period usually cannot.

Some questions are a single number the recruiter can read off a screen in the app. Total billings or fees for a date range live on the Placements tab, and open-role counts live on the Jobs tab. For those, give the short answer if a tool provides it, otherwise say which tab has it. Do not run a long chain of lookups to rebuild a figure the app already shows.

You only answer questions -- you cannot change a candidate's stage, log an interaction, send an email, or take any action. If asked to do something rather than answer something, say you can only look things up right now, not act.`;

const TOOL_DEFS: Tool[] = [
  {
    name: "get_candidate",
    description: "Look up one candidate by id: core profile fields plus their reconciled context summary.",
    input_schema: { type: "object", properties: { candidate_id: { type: "string" } }, required: ["candidate_id"] },
  },
  {
    name: "get_client",
    description: "Look up one client company by id: core profile fields plus their reconciled context summary.",
    input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] },
  },
  {
    name: "get_requisition",
    description: "Look up one open role by id: salary, status, strategic context, reconciled context summary.",
    input_schema: { type: "object", properties: { requisition_id: { type: "string" } }, required: ["requisition_id"] },
  },
  {
    name: "search_candidates",
    description: "Find candidates by name, skill, or profile description. Returns id, name, current company/title, status.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["active", "passive", "placed"] },
      },
      required: ["query"],
    },
  },
  {
    name: "search_clients",
    description: "Find client companies by name. Returns id, company name, industry.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_pipeline_summary",
    description: "Count the caller's own active processes by pipeline stage (Specs Sent, Buy-In, CV Sent, CCM rounds, Offer, Placed, Closed lost).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_pipeline",
    description:
      "List the caller's own active processes (excludes Placed and Closed lost) with per-item detail: candidate name, role title, client, current stage, buy-in / CV-sent / offer dates, candidate notice period in months, count of active competing interviews, days since last activity, and salary band. Use this for any question that asks which or what roles or candidates, or that ranks or prioritises the pipeline. Do not answer those from get_pipeline_summary's counts alone.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_client_scorecard",
    description: "Placement count, total fees, and closed-lost rejection pattern for one client (pattern only shown once there are 3+ closed-lost outcomes).",
    input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] },
  },
  {
    name: "get_outcome_stats",
    description: "Team-wide or single-client rollup: placements, closed-lost count, CCM pass/fail counts.",
    input_schema: { type: "object", properties: { client_id: { type: "string" } } },
  },
  {
    name: "list_priority_actions",
    description: "How many items the caller currently has snoozed on their own dashboard priority queue.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_interactions",
    description: "Search the actual timeline of calls, emails, and meetings for what was said -- not a summary. Use this for questions about a specific statement, date, or conversation. Optionally scope to one candidate or client id.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        candidate_id: { type: "string" },
        client_id: { type: "string" },
        since: { type: "string", description: "ISO date -- only interactions on or after this date" },
      },
      required: ["query"],
    },
    // Last tool in a list that never changes between calls -- cache_control here
    // plus the system-prompt breakpoint caches the whole static prefix
    // (tools -> system render before messages). Cuts repeated-input cost on the
    // multi-iteration loop; verify with response.usage.cache_read_input_tokens.
    cache_control: { type: "ephemeral" },
  },
];

async function runTool(name: string, input: Record<string, unknown>, teamId: string, recruiterId: string): Promise<{ result: unknown; record: ToolCallRecord }> {
  switch (name) {
    case "get_candidate": {
      const r = await tools.getCandidate(teamId, input.candidate_id as string);
      return { result: r.found ? r.data : { error: "not found" }, record: r.record };
    }
    case "get_client": {
      const r = await tools.getClient(teamId, input.client_id as string);
      return { result: r.found ? r.data : { error: "not found" }, record: r.record };
    }
    case "get_requisition": {
      const r = await tools.getRequisition(teamId, input.requisition_id as string);
      return { result: r.found ? r.data : { error: "not found" }, record: r.record };
    }
    case "search_candidates": {
      const r = await tools.searchCandidates(teamId, input.query as string, input.status as string | undefined);
      return { result: r.results, record: r.record };
    }
    case "search_clients": {
      const r = await tools.searchClients(teamId, input.query as string);
      return { result: r.results, record: r.record };
    }
    case "get_pipeline_summary": {
      const r = await tools.getPipelineSummary(teamId, recruiterId);
      return { result: r.counts, record: r.record };
    }
    case "list_pipeline": {
      const r = await tools.listPipeline(teamId, recruiterId);
      return { result: r.items, record: r.record };
    }
    case "get_client_scorecard": {
      const r = await tools.getClientScorecard(teamId, input.client_id as string);
      return { result: r.found ? r.data : { error: "not found" }, record: r.record };
    }
    case "get_outcome_stats": {
      const r = await tools.getOutcomeStats(teamId, input.client_id as string | undefined);
      return { result: r, record: r.record };
    }
    case "list_priority_actions": {
      const r = await tools.listPriorityActions(teamId, recruiterId);
      return { result: { snoozed_count: r.snoozed_count }, record: r.record };
    }
    case "search_interactions": {
      const r = await tools.searchInteractions(teamId, input.query as string, {
        candidateId: input.candidate_id as string | undefined,
        clientId: input.client_id as string | undefined,
        since: input.since as string | undefined,
      });
      return { result: r.results, record: r.record };
    }
    default:
      return { result: { error: `unknown tool ${name}` }, record: { tool: name, label: "unknown" } };
  }
}

const MAX_ITERATIONS = 6;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { recruiter_id, messages: history } = req.body as {
    recruiter_id: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };
  if (!recruiter_id || !history?.length) {
    return res.status(400).json({ error: "recruiter_id and messages are required" });
  }

  const { data: recruiter } = await supabase
    .from("recruiters")
    .select("team_id")
    .eq("id", recruiter_id)
    .single();
  if (!recruiter) return res.status(200).json({ error: "Could not identify your team. Try signing in again." });
  const teamId = recruiter.team_id;

  const messages: MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const recordsRead: ToolCallRecord[] = [];

  // One structured line per question -- captured by Vercel log drains. No table
  // yet: this is here to see what recruiters actually ask and what it costs
  // before deciding whether Ask Kanri warrants a bigger analytical build.
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  const logUsage = (iterations: number) =>
    console.log(
      JSON.stringify({
        tag: "ask-kanri",
        recruiter_id,
        team_id: teamId,
        iterations,
        tools_called: recordsRead.map((r) => r.tool),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheReadTokens,
      }),
    );

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        // Adaptive, not disabled: this is a multi-step tool-use loop and the
        // model plans which tools to chain materially better with thinking on.
        // Safe here (unlike the one-shot handlers) -- the text block is located
        // via .content.find and full content is echoed back each turn. This
        // handler is the documented exception in tests/ai-handlers-structure.test.ts.
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOL_DEFS,
        messages,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      if (response.stop_reason !== "tool_use") {
        const text = response.content.find((b) => b.type === "text")?.text.trim() ?? "";
        logUsage(i + 1);
        // Markdown / em-dash scrubbing happens centrally in api/ai.ts's res.json wrapper.
        return res.status(200).json({ answer: text, read: recordsRead });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      const toolResults = await Promise.all(
        toolUses.map(async (t) => {
          const { result, record } = await runTool(t.name, (t.input ?? {}) as Record<string, unknown>, teamId, recruiter_id);
          recordsRead.push(record);
          return {
            type: "tool_result" as const,
            tool_use_id: t.id,
            content: JSON.stringify(result),
          };
        }),
      );
      messages.push({ role: "user", content: toolResults });
    }

    logUsage(MAX_ITERATIONS);
    return res.status(200).json({
      answer: "That took more lookups than I can do in one go. Try narrowing the question.",
      read: recordsRead,
    });
  } catch (err) {
    console.error("[ask-kanri]", err instanceof Error ? err.message : err);
    return res.status(200).json({ error: "Could not answer that. Try again." });
  }
}
