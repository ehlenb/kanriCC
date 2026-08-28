import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OUTLOOK_SCOPE } from "./outlook-token.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  if (!clientId) {
    return res.json({ error: "OUTLOOK_CLIENT_ID not configured" });
  }

  const base = process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:5173";
  const redirectUri = `${base}/settings`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OUTLOOK_SCOPE,
    state: "outlook",
    response_mode: "query",
  });

  const tenantId = process.env.OUTLOOK_TENANT_ID ?? "common";
  return res.json({
    url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`,
  });
}
