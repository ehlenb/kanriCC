import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { provider, recruiter_id } = req.body as { provider?: string; recruiter_id?: string };
  if (!provider || !recruiter_id) return res.json({ error: "Missing provider or recruiter_id" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await supabase
    .from("recruiter_oauth_tokens")
    .delete()
    .eq("recruiter_id", recruiter_id)
    .eq("provider", provider);

  return res.json({ ok: true });
}
