import { createClient } from "@supabase/supabase-js";

// Resolve an email address to a candidate or client contact, team-scoped.
// Shared by the Outlook add-in's match-sender handler and the inbound-email
// poller. Runs under the service-role key (bypasses RLS) -- team_id must be
// filtered explicitly or a match can leak across teams (CLAUDE.md §2).

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type SenderMatch =
  | { type: "candidate"; candidateId: string; name: string; nameJapanese?: string | null; company?: string | null }
  | { type: "client_contact"; contactId: string; clientId: string; name: string; title?: string | null; company?: string | null }
  | null;

export async function matchSenderEmail(email: string, teamId?: string): Promise<SenderMatch> {
  const addr = email.trim().toLowerCase();
  if (!addr) return null;

  let candidateQuery = supabase
    .from("candidates")
    .select("id, full_name, full_name_japanese, current_company")
    .ilike("email", addr)
    .limit(1);
  if (teamId) candidateQuery = candidateQuery.eq("team_id", teamId);
  const { data: candidates } = await candidateQuery;
  if (candidates && candidates.length > 0) {
    const c = candidates[0] as { id: string; full_name: string; full_name_japanese: string | null; current_company: string | null };
    return { type: "candidate", candidateId: c.id, name: c.full_name, nameJapanese: c.full_name_japanese, company: c.current_company };
  }

  // client_contacts has no team_id of its own -- scoped via clients.team_id.
  let contactQuery = supabase
    .from("client_contacts")
    .select("id, name, title, client_id, clients!inner(company_name, team_id)")
    .ilike("email", addr)
    .limit(1);
  if (teamId) contactQuery = contactQuery.eq("clients.team_id", teamId);
  const { data: contacts } = await contactQuery;
  if (contacts && contacts.length > 0) {
    const ct = contacts[0] as { id: string; name: string; title: string | null; client_id: string; clients: { company_name: string } | null };
    return { type: "client_contact", contactId: ct.id, clientId: ct.client_id, name: ct.name, title: ct.title, company: ct.clients?.company_name ?? null };
  }

  return null;
}
