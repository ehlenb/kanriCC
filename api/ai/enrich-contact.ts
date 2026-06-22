import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  const { name, company } = req.body as { name?: string; company?: string; type?: string };
  if (!name || !company) return res.status(200).json({ error: "Missing name or company" });

  const apolloKey = process.env.APOLLO_API_KEY;
  const hunterKey = process.env.HUNTER_API_KEY;

  // ── Apollo.io primary ────────────────────────────────────────────────────────
  if (apolloKey) {
    try {
      const apolloRes = await fetch("https://api.apollo.io/v1/people/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apolloKey,
        },
        body: JSON.stringify({
          name,
          organization_name: company,
          reveal_personal_emails: true,
          reveal_phone_number: true,
        }),
      });

      if (apolloRes.ok) {
        const apolloData = await apolloRes.json() as {
          person?: {
            email?: string;
            phone_numbers?: Array<{ sanitized_number?: string }>;
          };
        };
        const person = apolloData.person;
        const email = person?.email ?? null;
        const phone = person?.phone_numbers?.[0]?.sanitized_number ?? null;
        if (email || phone) {
          return res.status(200).json({ data: { email, phone, source: "apollo" } });
        }
      }
    } catch {
      // fall through to Hunter
    }
  }

  // ── Hunter.io fallback ───────────────────────────────────────────────────────
  if (hunterKey) {
    try {
      const params = new URLSearchParams({
        full_name: name,
        company,
        api_key: hunterKey,
      });
      const hunterRes = await fetch(`https://api.hunter.io/v2/email-finder?${params.toString()}`);

      if (hunterRes.ok) {
        const hunterData = await hunterRes.json() as {
          data?: { email?: string };
        };
        const email = hunterData.data?.email ?? null;
        if (email) {
          return res.status(200).json({ data: { email, phone: null, source: "hunter" } });
        }
      }
    } catch {
      // fall through
    }
  }

  return res.status(200).json({ data: { email: null, phone: null, source: "none" } });
}
