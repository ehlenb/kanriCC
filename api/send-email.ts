import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "./oauth/gmail-exchange.js";

type SendPayload = {
  recruiter_id: string;
  to: string;
  subject: string;
  body: string;
  candidate_id?: string;
  client_id?: string;
  interaction_type?: string;
};

async function refreshGmailToken(refreshToken: string): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const data = (await resp.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ?? "Gmail token refresh failed");
  return data.access_token;
}

async function sendViaGmail(accessToken: string, to: string, subject: string, body: string): Promise<void> {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? "Gmail send failed");
  }
}

async function refreshOutlookToken(refreshToken: string): Promise<string> {
  const tenantId = process.env.OUTLOOK_TENANT_ID ?? "common";
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.OUTLOOK_CLIENT_ID!,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        scope:
          "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
      }),
    }
  );
  const data = (await resp.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description ?? "Outlook token refresh failed");
  return data.access_token;
}

async function sendViaOutlook(accessToken: string, to: string, subject: string, body: string): Promise<void> {
  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!resp.ok && resp.status !== 202) {
    const err = (await resp.text());
    throw new Error(err || "Outlook send failed");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { recruiter_id, to, subject, body, candidate_id, client_id, interaction_type } =
    req.body as SendPayload;

  if (!recruiter_id || !to || !subject) {
    return res.json({ error: "Missing required fields" });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find a connected provider for this recruiter
  const { data: tokens } = await supabase
    .from("recruiter_oauth_tokens")
    .select("provider, refresh_token_enc")
    .eq("recruiter_id", recruiter_id)
    .limit(1);

  if (!tokens || tokens.length === 0) {
    return res.json({ error: "No email provider connected. Connect Gmail or Outlook in Settings." });
  }

  const token = tokens[0] as { provider: string; refresh_token_enc: string };
  const refreshToken = decryptToken(token.refresh_token_enc);

  try {
    if (token.provider === "gmail") {
      const accessToken = await refreshGmailToken(refreshToken);
      await sendViaGmail(accessToken, to, subject, body);
    } else {
      const accessToken = await refreshOutlookToken(refreshToken);
      await sendViaOutlook(accessToken, to, subject, body);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    return res.json({ error: msg });
  }

  // Log to interactions
  const interactionRow: Record<string, unknown> = {
    recruiter_id,
    interaction_type: interaction_type ?? "email",
    summary: subject,
    full_notes: body,
    interacted_at: new Date().toISOString(),
    primary_party: candidate_id ? "candidate" : "client",
  };
  if (candidate_id) interactionRow.candidate_id = candidate_id;
  if (client_id) interactionRow.client_id = client_id;

  // Fetch team_id for recruiter (needed for RLS insert)
  const { data: rec } = await supabase
    .from("recruiters")
    .select("team_id")
    .eq("id", recruiter_id)
    .single();

  if (rec) {
    interactionRow.team_id = rec.team_id;
    await supabase.from("interactions").insert(interactionRow);
  }

  return res.json({ ok: true });
}
