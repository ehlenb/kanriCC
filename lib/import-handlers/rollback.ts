import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TABLE_BY_ENTITY: Record<string, string> = {
  clients: "clients",
  contacts: "client_contacts",
  requisitions: "requisitions",
  candidates: "candidates",
  processes: "processes",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { batch_id, recruiter_id } = req.body as { batch_id?: string; recruiter_id?: string };
  if (!batch_id || !recruiter_id) {
    return res.status(400).json({ error: "Missing batch_id or recruiter_id" });
  }

  const { data: batch, error: batchFetchError } = await supabase
    .from("import_batches")
    .select("id, entity_type, recruiter_id, status")
    .eq("id", batch_id)
    .single();

  if (batchFetchError || !batch) return res.status(404).json({ error: "Import batch not found" });
  if (batch.recruiter_id !== recruiter_id) {
    return res.status(403).json({ error: "You can only roll back your own imports" });
  }
  if (batch.status === "rolled_back") {
    return res.status(200).json({ data: { already_rolled_back: true } });
  }

  const table = TABLE_BY_ENTITY[batch.entity_type as string];
  const { data: items } = await supabase
    .from("import_batch_items")
    .select("entity_id")
    .eq("batch_id", batch_id);

  const ids = (items ?? []).map((i) => i.entity_id as string);
  if (ids.length > 0) {
    await supabase.from(table).delete().in("id", ids);
  }

  await supabase.from("import_batches").update({ status: "rolled_back" }).eq("id", batch_id);

  return res.status(200).json({ data: { rolled_back_count: ids.length } });
}
