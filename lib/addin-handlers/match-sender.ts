import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { email } = req.body as { email?: string };
  if (!email?.trim()) return res.json({ error: "email required" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const addr = email.trim().toLowerCase();

  // 1. Check candidates
  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, full_name, full_name_japanese, current_company")
    .ilike("email", addr)
    .limit(1);

  if (candidates && candidates.length > 0) {
    const c = candidates[0] as { id: string; full_name: string; full_name_japanese: string | null; current_company: string | null };
    return res.json({
      match: {
        type: "candidate",
        candidateId: c.id,
        name: c.full_name,
        nameJapanese: c.full_name_japanese,
        company: c.current_company,
      },
    });
  }

  // 2. Check client contacts
  const { data: contacts } = await supabase
    .from("client_contacts")
    .select("id, name, title, client_id, clients(id, company_name)")
    .ilike("email", addr)
    .limit(1);

  if (contacts && contacts.length > 0) {
    const ct = contacts[0] as { id: string; name: string; title: string | null; client_id: string; clients: { id: string; company_name: string } | null };
    return res.json({
      match: {
        type: "client_contact",
        contactId: ct.id,
        clientId: ct.client_id,
        name: ct.name,
        title: ct.title,
        company: ct.clients?.company_name ?? null,
      },
    });
  }

  return res.json({ match: null });
}
