import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

import { decryptToken } from "../oauth-handlers/token-crypto.js";
import { refreshOutlookToken, OUTLOOK_SCOPE } from "../oauth-handlers/outlook-token.js";
import { matchSenderEmail } from "../addin-handlers/match-sender-lib.js";

// Inbound Outlook email capture (Part B). Fired by pg_cron every ~2 minutes
// (migration 062). For each recruiter with a connected Outlook mailbox, pull
// messages received since the last poll, match the sender against this team's
// candidates / client contacts, and log matched ones as `email received`
// interactions. Known-senders-only keeps the timeline from filling with noise;
// no AI, no buy-in detection -- the recruiter marks buy-in manually.

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type GraphMessage = {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string } };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = req.headers["x-internal-secret"];
  if (!process.env.INTERNAL_JOB_SECRET || secret !== process.env.INTERNAL_JOB_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { data: tokens } = await supabase
    .from("recruiter_oauth_tokens")
    .select("recruiter_id, team_id, refresh_token_enc")
    .eq("provider", "outlook");

  let totalInserted = 0;

  for (const tok of (tokens ?? []) as { recruiter_id: string; team_id: string; refresh_token_enc: string }[]) {
    try {
      const { data: state } = await supabase
        .from("outlook_inbound_state")
        .select("last_polled_at")
        .eq("recruiter_id", tok.recruiter_id)
        .maybeSingle();
      // No state row => mailbox connected before Mail.Read / before this feature.
      // Skip until the recruiter reconnects (which creates the row).
      if (!state) continue;

      const since = state.last_polled_at as string;
      const accessToken = await refreshOutlookToken(decryptToken(tok.refresh_token_enc), { scope: OUTLOOK_SCOPE });

      const url =
        `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages` +
        `?$select=id,subject,bodyPreview,receivedDateTime,from` +
        `&$filter=${encodeURIComponent(`receivedDateTime gt ${since}`)}` +
        `&$orderby=receivedDateTime desc&$top=50`;

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!resp.ok) {
        console.error("[poll-outlook-inbound]", tok.recruiter_id, "graph error", resp.status, await resp.text());
        continue;
      }
      const body = (await resp.json()) as { value?: GraphMessage[] };
      const messages = body.value ?? [];

      let inserted = 0;
      for (const m of messages) {
        const addr = m.from?.emailAddress?.address;
        if (!addr) continue;
        const match = await matchSenderEmail(addr, tok.team_id);
        if (!match) continue;

        const { data: dup } = await supabase
          .from("interactions")
          .select("id")
          .eq("recruiter_id", tok.recruiter_id)
          .eq("graph_message_id", m.id)
          .limit(1);
        if (dup && dup.length > 0) continue;

        const row: Record<string, unknown> = {
          recruiter_id: tok.recruiter_id,
          team_id: tok.team_id,
          interaction_type: "email received",
          direction: "inbound",
          primary_party: match.type === "candidate" ? "candidate" : "client",
          summary: m.subject ?? "(no subject)",
          full_notes: m.bodyPreview ?? null,
          interacted_at: m.receivedDateTime,
          graph_message_id: m.id,
        };
        if (match.type === "candidate") {
          row.candidate_id = match.candidateId;
        } else {
          row.client_id = match.clientId;
          row.contact_id = match.contactId;
        }
        const { error } = await supabase.from("interactions").insert(row);
        if (!error) inserted++;
        else if (!String(error.message).includes("duplicate key")) {
          console.error("[poll-outlook-inbound]", tok.recruiter_id, "insert error", error.message);
        }
      }

      await supabase
        .from("outlook_inbound_state")
        .update({ last_polled_at: new Date().toISOString() })
        .eq("recruiter_id", tok.recruiter_id);

      totalInserted += inserted;
      console.log(
        JSON.stringify({ tag: "poll-outlook-inbound", recruiter_id: tok.recruiter_id, seen: messages.length, inserted }),
      );
    } catch (err) {
      console.error("[poll-outlook-inbound]", tok.recruiter_id, err instanceof Error ? err.message : err);
    }
  }

  return res.status(200).json({ ok: true, inserted: totalInserted });
}
