import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Row = Record<string, string | number | boolean | null | undefined>;

type CommitBody = {
  entity_type?: "clients" | "contacts" | "requisitions" | "candidates" | "processes" | "interactions";
  recruiter_id?: string;
  team_id?: string;
  source_name?: string;
  rows?: Row[];
};

const VALID_CONTACT_ROLES = ["hiring_manager", "hr_gatekeeper", "ta_coordinator", "executive", "other"];
const VALID_CANDIDATE_SOURCES = ["linkedin", "bizreach", "doda", "referral", "inbound", "other"];
const VALID_INTERACTION_TYPES = [
  "call", "email", "email received", "meeting", "note",
  "job spec sent", "linkedin message", "interview scheduled", "cv sent", "other",
  "ccm1", "ccm2", "ccm3", "ccm4", "ccm5", "ccm6",
];
const VALID_PRIMARY_PARTIES = ["candidate", "client"];

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
        kk_entity: row.kk_entity ? String(row.kk_entity) : null,
        japan_team_size: row.japan_team_size ? Number(row.japan_team_size) : null,
        years_in_japan: row.years_in_japan ? Number(row.years_in_japan) : null,
        website: row.website || null,
        recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (error) console.error("import clients insert error:", error.message);
    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

async function importContacts(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    const clientName = String(row.client_company_name ?? "").trim();
    if (!name || !clientName) {
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

    const email = row.email ? String(row.email).trim() : null;
    if (email) {
      const { data: existing } = await supabase
        .from("client_contacts")
        .select("id")
        .eq("client_id", client.id)
        .ilike("email", email)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    const roleRaw = String(row.role ?? "other").trim().toLowerCase();
    const role = VALID_CONTACT_ROLES.includes(roleRaw) ? roleRaw : "other";

    const { data, error } = await supabase
      .from("client_contacts")
      .insert({
        client_id: client.id,
        name,
        role,
        title: row.title || null,
        email,
        phone: row.phone || null,
        is_primary: row.is_primary === "true" || row.is_primary === true,
        recruiter_id,
      })
      .select("id")
      .single();

    if (error) console.error("import contacts insert error:", error.message);
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
        recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (error) console.error("import requisitions insert error:", error.message);
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
        source: (() => {
          const s = String(row.source ?? "").trim().toLowerCase();
          return VALID_CANDIDATE_SOURCES.includes(s) ? s : "other";
        })(),
        recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (error) console.error("import candidates insert error:", error.message);
    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

async function importProcesses(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const candidateName = String(row.candidate_full_name ?? "").trim();
    const candidateEmail = String(row.candidate_email ?? "").trim();
    const reqTitle = String(row.requisition_title ?? "").trim();
    const clientName = String(row.client_company_name ?? "").trim();
    const stage = String(row.stage ?? "Specs Sent").trim();
    if (!candidateName || !reqTitle) {
      skipped++;
      continue;
    }

    let candQuery = supabase.from("candidates").select("id").eq("team_id", team_id);
    candQuery = candidateEmail
      ? candQuery.ilike("email", candidateEmail)
      : candQuery.ilike("full_name", candidateName);
    const { data: candidateRows } = await candQuery.limit(1);
    const candidate = candidateRows?.[0] ?? null;

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

    if (error) console.error("import processes insert error:", error.message);
    if (!error && data) inserted.push(data.id as string);
  }

  return { inserted, skipped };
}

async function importInteractions(rows: Row[], recruiter_id: string, team_id: string) {
  const inserted: string[] = [];
  let skipped = 0;

  for (const row of rows) {
    const candidateName = String(row.candidate_full_name ?? "").trim();
    const candidateEmail = String(row.candidate_email ?? "").trim();
    const clientName = String(row.client_company_name ?? "").trim();
    const reqTitle = String(row.requisition_title ?? "").trim();
    const typeRaw = String(row.interaction_type ?? "").trim().toLowerCase();
    const interacted_at = String(row.interacted_at ?? "").trim();

    if ((!candidateName && !candidateEmail && !clientName) || !typeRaw || !interacted_at) {
      skipped++;
      continue;
    }

    const interaction_type = VALID_INTERACTION_TYPES.includes(typeRaw) ? typeRaw : "note";

    let candidate_id: string | null = null;
    if (candidateEmail || candidateName) {
      let candQuery = supabase.from("candidates").select("id").eq("team_id", team_id);
      candQuery = candidateEmail
        ? candQuery.ilike("email", candidateEmail)
        : candQuery.ilike("full_name", candidateName);
      const { data: candRows } = await candQuery.limit(1);
      candidate_id = candRows?.[0]?.id ?? null;
    }

    let client_id: string | null = null;
    if (clientName) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("team_id", team_id)
        .ilike("company_name", clientName)
        .maybeSingle();
      client_id = clientRow?.id ?? null;
    }

    if (!candidate_id && !client_id) {
      skipped++;
      continue;
    }

    let requisition_id: string | null = null;
    if (reqTitle && client_id) {
      const { data: reqRow } = await supabase
        .from("requisitions")
        .select("id")
        .eq("team_id", team_id)
        .eq("client_id", client_id)
        .ilike("title", reqTitle)
        .maybeSingle();
      requisition_id = reqRow?.id ?? null;
    }

    let process_id: string | null = null;
    if (candidate_id && requisition_id) {
      const { data: procRow } = await supabase
        .from("processes")
        .select("id")
        .eq("candidate_id", candidate_id)
        .eq("requisition_id", requisition_id)
        .maybeSingle();
      process_id = procRow?.id ?? null;
    }

    const primaryPartyRaw = String(row.primary_party ?? "").trim().toLowerCase();
    const primary_party = VALID_PRIMARY_PARTIES.includes(primaryPartyRaw)
      ? primaryPartyRaw
      : candidate_id
        ? "candidate"
        : "client";

    const { data, error } = await supabase
      .from("interactions")
      .insert({
        candidate_id,
        client_id,
        requisition_id,
        process_id,
        interaction_type,
        primary_party,
        summary: row.summary || null,
        full_notes: row.full_notes || null,
        interacted_at,
        recruiter_id,
        team_id,
      })
      .select("id")
      .single();

    if (error) console.error("import interactions insert error:", error.message);
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
    else if (entity_type === "contacts") result = await importContacts(rows, recruiter_id, team_id);
    else if (entity_type === "requisitions")
      result = await importRequisitions(rows, recruiter_id, team_id);
    else if (entity_type === "candidates")
      result = await importCandidates(rows, recruiter_id, team_id);
    else if (entity_type === "processes")
      result = await importProcesses(rows, recruiter_id, team_id);
    else if (entity_type === "interactions")
      result = await importInteractions(rows, recruiter_id, team_id);
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
