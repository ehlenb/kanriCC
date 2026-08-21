import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const team_id = req.query.team_id as string | undefined;
  if (!team_id) return res.status(400).json({ error: "Missing team_id" });

  const { data, error } = await supabase
    .from("import_batches")
    .select("id, entity_type, source_name, row_count, status, created_at, recruiter_id")
    .eq("team_id", team_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return res.status(200).json({ error: "Could not load import history." });
  return res.status(200).json({ data });
}
