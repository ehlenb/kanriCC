import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TARGET_FIELDS: Record<string, string[]> = {
  clients: [
    "company_name",
    "industry",
    "hq_country",
    "kk_entity",
    "japan_team_size",
    "years_in_japan",
    "website",
  ],
  requisitions: [
    "title",
    "client_company_name",
    "salary_range_text",
    "location",
    "is_backfill",
    "urgency_date",
  ],
  candidates: [
    "full_name",
    "full_name_japanese",
    "current_company",
    "current_title",
    "email",
    "phone",
    "japanese_level",
    "english_level",
    "current_base",
    "current_bonus",
    "expected_total_min",
    "expected_total_max",
    "source",
  ],
  processes: ["candidate_full_name", "requisition_title", "client_company_name", "stage"],
  contacts: [
    "client_company_name",
    "name",
    "title",
    "role",
    "email",
    "phone",
    "is_primary",
  ],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { entity_type, headers, sample_rows } = req.body as {
    entity_type?: string;
    headers?: string[];
    sample_rows?: string[][];
  };

  if (!entity_type || !TARGET_FIELDS[entity_type] || !headers?.length) {
    return res.status(400).json({ error: "Missing entity_type or headers" });
  }

  const targetFields = TARGET_FIELDS[entity_type];
  const preview = (sample_rows ?? [])
    .slice(0, 3)
    .map((row) => headers.map((h, i) => `${h}: ${row[i] ?? ""}`).join(" | "))
    .join("\n");

  const prompt = `You are mapping columns from an uploaded CSV export (likely from an ATS like Vincere or Bullhorn) to a fixed set of target fields.

Source CSV columns:
${headers.join(", ")}

Sample rows:
${preview || "(no sample rows provided)"}

Target fields for "${entity_type}":
${targetFields.join(", ")}

For each target field, pick the source column name that best matches it, or omit the field if no source column is a reasonable match. Do not guess wildly — only map a field if you're reasonably confident.

Return only a JSON object mapping target field name -> source column name, e.g. {"full_name": "Candidate Name"}. Omit fields with no confident match.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    let mapping: Record<string, string> = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) mapping = JSON.parse(jsonMatch[0]) as Record<string, string>;
    } catch {
      // return empty mapping if parsing fails — recruiter maps manually
    }

    return res.status(200).json({ data: { mapping, target_fields: targetFields } });
  } catch (err) {
    console.error("suggest-mapping error:", err);
    return res
      .status(200)
      .json({ data: { mapping: {}, target_fields: targetFields }, error: "Could not suggest a mapping. Map columns manually." });
  }
}
