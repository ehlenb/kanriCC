import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface CompanyEnrichment {
  japanTeamSize?: string;
  japanTeamSizeInt?: number;
  yearsInJapan?: number;
  employeeJapanesePct?: number;
  japanRoleInGroup?: string;
  strategicPriorities?: string;
  recentInitiatives?: string;
  sourceUrls?: string[];
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
  detail?: { error?: string };
}

async function tavilySearch(query: string, apiKey: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: 5,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as TavilyResponse;
    const detail = body.detail?.error ?? `HTTP ${res.status}`;
    throw new Error(`Tavily: ${detail}`);
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results ?? [];
}

const EXTRACTION_PROMPT = `You are a Japan market research analyst for a bilingual talent recruitment agency.

Extract information about this company's Japan operations from the search results below. Return a JSON object with these fields (omit any field not clearly supported by the sources — never fabricate):

{
  "japanTeamSize": string,
  "japanTeamSizeInt": number,
  "yearsInJapan": number,
  "employeeJapanesePct": number,
  "japanRoleInGroup": string,
  "strategicPriorities": string,
  "recentInitiatives": string
}

Field guidance:
- japanTeamSize: size of the Japan team in plain language (e.g. "approximately 300 employees").
- japanTeamSizeInt: the numeric headcount as an integer (best estimate from the source).
- yearsInJapan: integer for how many years they have operated in Japan. Calculate from founding or market-entry year if stated.
- employeeJapanesePct: estimated percentage (0-100) of Japanese nationals on the Japan team. Omit if not inferable.
- japanRoleInGroup: one short phrase — e.g. "Japan subsidiary", "APAC HQ", "Representative office", "Independent KK".
- strategicPriorities: 2-3 concise sentences on their Japan-specific business focus, growth areas, and role within the global group.
- recentInitiatives: 1-2 sentences on the most recent notable activity in Japan — expansions, launches, hires, partnerships. Include dates where available.

Rules:
- Base all content strictly on the provided sources. Never use general knowledge not reflected in the results.
- Write in plain, professional English suitable for a senior recruiter presenting this company to a candidate.
- If a field cannot be supported by the sources, omit it entirely.
- Return only valid JSON. No markdown fences, no explanation, no trailing text.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client_id, company_name, url } = req.body as {
    client_id: string;
    company_name?: string;
    url?: string;
  };

  if (!client_id) return res.status(400).json({ error: "client_id is required" });
  if (!company_name && !url) return res.status(400).json({ error: "company_name or url is required" });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ error: "TAVILY_API_KEY is not configured" });
  }

  const companyLabel = company_name ?? url ?? "this company";
  const queries: string[] = [];

  if (company_name) {
    queries.push(`"${company_name}" Japan office employees team operations history`);
    queries.push(`"${company_name}" Japan strategy business news 2024 2025`);
  }

  if (url) {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      queries.push(`site:${domain} Japan`);
      if (!company_name) {
        const domainLabel = domain.split(".")[0];
        queries.push(`"${domainLabel}" Japan office team operations 2024 2025`);
      }
    } catch {
      queries.push(`${url} Japan operations`);
    }
  }

  let allResults: TavilyResult[] = [];
  try {
    const batches = await Promise.all(queries.map((q) => tavilySearch(q, apiKey)));
    for (const batch of batches) allResults = allResults.concat(batch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return res.status(200).json({ error: message });
  }

  const seen = new Set<string>();
  const deduped = allResults
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (deduped.length === 0) {
    return res.status(200).json({ error: "Could not find company data. Add a URL or paste notes manually." });
  }

  const sourceUrls = deduped.map((r) => r.url);
  const searchContext = deduped
    .map((r) => `SOURCE: ${r.url}\nTITLE: ${r.title}\n${r.content}`)
    .join("\n\n---\n\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nCOMPANY: ${companyLabel}\n\nSEARCH RESULTS:\n${searchContext}`,
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Omit<CompanyEnrichment, "sourceUrls">;
    const enrichment: CompanyEnrichment = { ...parsed, sourceUrls };

    // Fire refresh-context for the client (best-effort)
    fetch(`${process.env.API_BASE_URL}/api/ai/refresh-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: "client", entity_id: client_id }),
    }).catch(() => {});

    return res.status(200).json({ enrichment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return res.status(200).json({ error: message });
  }
}
