import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { encryptToken } from "./gmail-exchange.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { code, recruiter_id } = req.body as { code?: string; recruiter_id?: string };
  if (!code || !recruiter_id) return res.json({ error: "Missing code or recruiter_id" });

  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.json({ error: "Outlook OAuth not configured" });

  const base = process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:5173";
  const redirectUri = `${base}/settings`;
  const tenantId = process.env.OUTLOOK_TENANT_ID ?? "common";

  const tokenResp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope:
          "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access",
      }),
    }
  );

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token || !tokenData.refresh_token) {
    return res.json({ error: tokenData.error_description ?? tokenData.error ?? "Token exchange failed" });
  }

  const profileResp = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = (await profileResp.json()) as { mail?: string; userPrincipalName?: string };
  const email = profile.mail ?? profile.userPrincipalName ?? "";

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rec } = await supabase
    .from("recruiters")
    .select("team_id")
    .eq("id", recruiter_id)
    .single();

  if (!rec) return res.json({ error: "Recruiter not found" });

  const enc = encryptToken(tokenData.refresh_token);

  await supabase
    .from("recruiter_oauth_tokens")
    .upsert(
      {
        recruiter_id,
        team_id: rec.team_id,
        provider: "outlook",
        email,
        refresh_token_enc: enc,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "recruiter_id,provider" }
    );

  return res.json({ email });
}
