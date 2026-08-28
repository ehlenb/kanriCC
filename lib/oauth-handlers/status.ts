import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const recruiter_id = req.query.recruiter_id as string;
  if (!recruiter_id) return res.json({ error: "Missing recruiter_id" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from("recruiter_oauth_tokens")
    .select("provider, email")
    .eq("recruiter_id", recruiter_id)
    .eq("provider", "outlook");

  const row = (data ?? [])[0];
  return res.json({ outlook: row ? { email: row.email as string } : null });
}
