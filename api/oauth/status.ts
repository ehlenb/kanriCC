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
    .eq("recruiter_id", recruiter_id);

  const result: Record<string, { email: string } | null> = {
    gmail: null,
    outlook: null,
  };

  for (const row of data ?? []) {
    result[row.provider as string] = { email: row.email as string };
  }

  return res.json(result);
}
