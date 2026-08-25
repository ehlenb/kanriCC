import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { email, team_id } = req.body as { email?: string; team_id?: string };
  if (!email?.trim()) return res.json({ error: "email required" });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const addr = email.trim().toLowerCase();

  // Runs under the service-role key, which bypasses RLS — team_id must be
  // filtered explicitly here or a match can leak a candidate/contact from a
  // different team (CLAUDE.md §2). Optional only so the existing dev-mode
  // test-address path (no signed-in recruiter yet) still works.
  let candidateQuery = supabase
    .from("candidates")
    .select("id, full_name, full_name_japanese, current_company")
    .ilike("email", addr)
    .limit(1);
  if (team_id) candidateQuery = candidateQuery.eq("team_id", team_id);

  // 1. Check candidates
  const { data: candidates } = await candidateQuery;

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

  // 2. Check client contacts — client_contacts has no team_id column of its
  // own, it's scoped via client_id -> clients.team_id, so the filter has to
  // go through the join (inner join makes the filter actually apply).
  let contactQuery = supabase
    .from("client_contacts")
    .select("id, name, title, client_id, clients!inner(id, company_name, team_id)")
    .ilike("email", addr)
    .limit(1);
  if (team_id) contactQuery = contactQuery.eq("clients.team_id", team_id);
  const { data: contacts } = await contactQuery;

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
