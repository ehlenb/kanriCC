import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

function encryptionKey(): Buffer {
  const raw = process.env.OAUTH_ENCRYPTION_KEY ?? "kanri-dev-oauth-key-32-chars-pad";
  return Buffer.from(raw.padEnd(32, "0").slice(0, 32));
}

export function encryptToken(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptToken(enc: string): string {
  const [ivHex, encHex] = enc.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", encryptionKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { code, recruiter_id } = req.body as { code?: string; recruiter_id?: string };
  if (!code || !recruiter_id) return res.json({ error: "Missing code or recruiter_id" });

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.json({ error: "Gmail OAuth not configured" });

  const base = process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:5173";
  const redirectUri = `${base}/settings`;

  // Exchange code for tokens
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };

  if (!tokenData.access_token || !tokenData.refresh_token) {
    return res.json({ error: tokenData.error ?? "Token exchange failed" });
  }

  // Fetch connected email
  const profileResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = (await profileResp.json()) as { email?: string };
  const email = profile.email ?? "";

  // Store encrypted refresh token
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch team_id for this recruiter
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
        provider: "gmail",
        email,
        refresh_token_enc: enc,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "recruiter_id,provider" }
    );

  return res.json({ email });
}
