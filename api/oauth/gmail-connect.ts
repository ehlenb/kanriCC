import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) {
    return res.json({ error: "GMAIL_CLIENT_ID not configured" });
  }

  const base = process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:5173";
  const redirectUri = `${base}/settings`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    state: "gmail",
  });

  return res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}
