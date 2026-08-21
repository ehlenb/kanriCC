import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Row = Record<string, string | number | boolean | null | undefined>;

type CommitBody = {
  entity_type?: "clients" | "requisitions" | "candidates" | "processes";
  recruiter_id?: string;
  team_id?: string;
  source_name?: string;
  rows?: Row[];
};

async function importClients(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const company_name = String(row.company_name ?? "").trim();
    if (!company_name) continue;

    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("team_id", team_id)
      .ilike("company_name", company_name)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({
        company_name,
        industry: row.industry || null,
        hq_country: row.hq_country || null,
        kk_entity: row.kk_entity || null,
        japan_team_size: row.japan_team_size ? Number(row.japan_team_size) : null,
        years_in_japan: row.years_in_japan ? Number(row.years_in_japan) : null,
        website: row.website || null,
        owner_recruiter_id: recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

async function importRequisitions(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const title = String(row.title ?? "").trim();
    const clientName = String(row.client_company_name ?? "").trim();
    if (!title || !clientName) {
      skipped++;
      continue;
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("team_id", team_id)
      .ilike("company_name", clientName)
      .maybeSingle();

    if (!client) {
      skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("requisitions")
      .insert({
        title,
        client_id: client.id,
        salary_range_text: row.salary_range_text || null,
        location: row.location || null,
        is_backfill: row.is_backfill === "true" || row.is_backfill === true,
        urgency_date: row.urgency_date || null,
        is_open: true,
        owner_recruiter_id: recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

async function importCandidates(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const full_name = String(row.full_name ?? "").trim();
    if (!full_name) {
      skipped++;
      continue;
    }

    const email = row.email ? String(row.email).trim() : null;
    if (email) {
      const { data: existing } = await supabase
        .from("candidates")
        .select("id")
        .eq("team_id", team_id)
        .ilike("email", email)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        full_name,
        full_name_japanese: row.full_name_japanese || null,
        current_company: row.current_company || null,
        current_title: row.current_title || null,
        email,
        phone: row.phone || null,
        japanese_level: row.japanese_level || null,
        english_level: row.english_level || null,
        current_base: row.current_base ? Number(row.current_base) : null,
        current_bonus: row.current_bonus ? Number(row.current_bonus) : null,
        expected_total_min: row.expected_total_min ? Number(row.expected_total_min) : null,
        expected_total_max: row.expected_total_max ? Number(row.expected_total_max) : null,
        source: row.source || "other",
        owner_recruiter_id: recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

async function importProcesses(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const candidateName = String(row.candidate_full_name ?? "").trim();
    const reqTitle = String(row.requisition_title ?? "").trim();
    const clientName = String(row.client_company_name ?? "").trim();
    const stage = String(row.stage ?? "Specs Sent").trim();
    if (!candidateName || !reqTitle) {
      skipped++;
      continue;
    }

    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("team_id", team_id)
      .ilike("full_name", candidateName)
      .maybeSingle();

    let reqQuery = supabase
      .from("requisitions")
      .select("id, client_id, clients!inner(company_name)")
      .eq("team_id", team_id)
      .ilike("title", reqTitle);
    if (clientName) reqQuery = reqQuery.ilike("clients.company_name", clientName);
    const { data: requisition } = await reqQuery.maybeSingle();

    if (!candidate || !requisition) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from("processes")
      .select("id")
      .eq("candidate_id", candidate.id)
      .eq("requisition_id", requisition.id)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("processes")
      .insert({
        candidate_id: candidate.id,
        requisition_id: requisition.id,
        stage,
        coverage_type: "own",
        owner_recruiter_id: recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { entity_type, recruiter_id, team_id, source_name, rows } = req.body as CommitBody;

  if (!entity_type || !recruiter_id || !team_id || !rows?.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let result: { inserted: string[]; skipped: number };
  try {
    if (entity_type === "clients") result = await importClients(rows, recruiter_id, team_id);
    else if (entity_type === "requisitions")
      result = await importRequisitions(rows, recruiter_id, team_id);
    else if (entity_type === "candidates")
      result = await importCandidates(rows, recruiter_id, team_id);
    else if (entity_type === "processes")
      result = await importProcesses(rows, recruiter_id, team_id);
    else return res.status(400).json({ error: "Unknown entity_type" });
  } catch (err) {
    console.error("import commit error:", err);
    return res.status(200).json({ error: "Import failed partway through. No changes were rolled back automatically — check the Import history for what was created." });
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      recruiter_id,
      team_id,
      entity_type,
      source_name: source_name || null,
      row_count: result.inserted.length,
    })
    .select("id")
    .single();

  if (!batchError && batch && result.inserted.length > 0) {
    await supabase
      .from("import_batch_items")
      .insert(result.inserted.map((entity_id) => ({ batch_id: batch.id, entity_id })));
  }

  return res.status(200).json({
    data: {
      batch_id: batch?.id ?? null,
      inserted_count: result.inserted.length,
      skipped_count: result.skipped,
    },
  });
}
