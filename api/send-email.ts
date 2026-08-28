import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "../lib/oauth-handlers/token-crypto.js";

type Attachment = { path: string; filename: string };
type ResolvedAttachment = { filename: string; contentType: string; base64: string };

type SendPayload = {
  recruiter_id: string;
  to: string;
  subject: string;
  body: string;
  candidate_id?: string;
  client_id?: string;
  contact_id?: string;
  requisition_id?: string;
  direction?: "inbound" | "outbound";
  primary_party?: "candidate" | "client";
  interaction_type?: string;
  attachments?: Attachment[];
};

function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  return "application/octet-stream";
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

async function sendViaOutlook(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  attachments: ResolvedAttachment[],
): Promise<void> {
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
        ...(attachments.length > 0 && {
          attachments: attachments.map((a) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.contentType,
            contentBytes: a.base64,
          })),
        }),
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

  const {
    recruiter_id,
    to,
    subject,
    body,
    candidate_id,
    client_id,
    contact_id,
    requisition_id,
    direction,
    primary_party,
    interaction_type,
    attachments,
  } = req.body as SendPayload;

  if (!recruiter_id || !to || !subject) {
    return res.json({ error: "Missing required fields" });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Resolve attachments from the resumes bucket (JD / CV files) before sending.
  const resolvedAttachments: ResolvedAttachment[] = [];
  for (const a of attachments ?? []) {
    const { data: file, error } = await supabase.storage.from("resumes").download(a.path);
    if (error || !file) {
      console.error("[send-email] attachment download failed", a.path, error?.message);
      return res.json({ error: "Could not attach the file. Try again." });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    resolvedAttachments.push({
      filename: a.filename,
      contentType: mimeFromName(a.filename),
      base64: buf.toString("base64"),
    });
  }

  // Find the recruiter's connected Outlook mailbox (Outlook is the only provider).
  const { data: tokens } = await supabase
    .from("recruiter_oauth_tokens")
    .select("refresh_token_enc")
    .eq("recruiter_id", recruiter_id)
    .eq("provider", "outlook")
    .limit(1);

  if (!tokens || tokens.length === 0) {
    return res.json({ error: "No email provider connected. Connect Outlook in Settings." });
  }

  const token = tokens[0] as { refresh_token_enc: string };

  try {
    // decryptToken can throw ("bad decrypt") if OAUTH_ENCRYPTION_KEY changed
    // since the token was stored -- keep it inside the try so it surfaces as a
    // handled error rather than crashing the handler.
    const refreshToken = decryptToken(token.refresh_token_enc);
    const accessToken = await refreshOutlookToken(refreshToken);
    await sendViaOutlook(accessToken, to, subject, body, resolvedAttachments);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    console.error("[send-email]", msg);
    const looksLikeAuth =
      /bad decrypt|invalid[_ ]grant|invalid[_ ]client|refresh failed|unauthor|expired|AADSTS|wrong final block/i.test(
        msg,
      );
    return res.json({
      error: looksLikeAuth
        ? "Your Outlook connection is no longer valid. Reconnect Outlook in Settings."
        : "Could not send email. Try again.",
    });
  }

  // Log to interactions
  const interactionRow: Record<string, unknown> = {
    recruiter_id,
    interaction_type: interaction_type ?? "email",
    summary: subject,
    full_notes: body,
    interacted_at: new Date().toISOString(),
    direction: direction ?? "outbound",
    primary_party: primary_party ?? (candidate_id ? "candidate" : "client"),
  };
  if (candidate_id) interactionRow.candidate_id = candidate_id;
  if (client_id) interactionRow.client_id = client_id;
  if (contact_id) interactionRow.contact_id = contact_id;
  if (requisition_id) interactionRow.requisition_id = requisition_id;

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
