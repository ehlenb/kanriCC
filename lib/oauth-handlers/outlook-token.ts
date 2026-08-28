// Shared Outlook / Microsoft Graph OAuth scopes + refresh.
//
// OUTLOOK_SCOPE is the full set requested at initial consent (connect +
// code exchange). Mail.Read is needed by the inbound-email poller.
//
// refreshOutlookToken defaults to the SEND-only subset: you may request any
// subset of the originally-granted scopes on refresh, but never a superset.
// A token minted before Mail.Read was added still refreshes fine for sending;
// the poller passes the full scope explicitly and simply fails (and skips)
// until the recruiter reconnects with Mail.Read granted.

const SEND_SCOPE = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
].join(" ");

export const OUTLOOK_SCOPE = `https://graph.microsoft.com/Mail.Read ${SEND_SCOPE}`;

export async function refreshOutlookToken(
  refreshToken: string,
  opts: { scope?: string } = {},
): Promise<string> {
  const tenantId = process.env.OUTLOOK_TENANT_ID ?? "common";
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.OUTLOOK_CLIENT_ID!,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      scope: opts.scope ?? SEND_SCOPE,
    }),
  });
  const data = (await resp.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description ?? "Outlook token refresh failed");
  return data.access_token;
}
