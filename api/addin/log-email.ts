import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type Payload = {
  recruiter_id: string;
  subject: string;
  body: string;
  sent_at: string;
  from_email: string;
  from_name: string;
  candidate_id?: string;
  client_id?: string;
  contact_id?: string;
  outlook_web_link?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const {
    recruiter_id,
    subject,
    body,
    sent_at,
    from_email,
    from_name,
    candidate_id,
    client_id,
    contact_id,
    outlook_web_link,
  } = req.body as Payload;

  if (!recruiter_id || !subject || !sent_at) {
    return res.json({ error: "Missing required fields" });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch team_id from recruiters
  const { data: recruiter } = await supabase
    .from("recruiters")
    .select("team_id")
    .eq("id", recruiter_id)
    .single();

  if (!recruiter) return res.json({ error: "Recruiter not found" });

  // Prepend outlook link to notes so ActivityTimeline can render it
  const fullNotes = [
    outlook_web_link ? `View in Outlook: ${outlook_web_link}` : null,
    body || null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { error } = await supabase.from("interactions").insert({
    recruiter_id,
    team_id: recruiter.team_id,
    interaction_type: "email",
    summary: `${from_name || from_email}: ${subject}`,
    full_notes: fullNotes || null,
    interacted_at: sent_at,
    primary_party: candidate_id ? "candidate" : "client",
    candidate_id: candidate_id ?? null,
    client_id: client_id ?? null,
    contact_id: contact_id ?? null,
  });

  if (error) return res.json({ error: error.message });
  return res.json({ ok: true });
}
