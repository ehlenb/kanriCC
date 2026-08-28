import type { VercelRequest, VercelResponse } from "@vercel/node";
import { matchSenderEmail } from "./match-sender-lib.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { email, team_id } = req.body as { email?: string; team_id?: string };
  if (!email?.trim()) return res.json({ error: "email required" });

  const match = await matchSenderEmail(email, team_id);
  if (!match) return res.json({ match: null });

  if (match.type === "candidate") {
    return res.json({
      match: {
        type: "candidate",
        candidateId: match.candidateId,
        name: match.name,
        nameJapanese: match.nameJapanese ?? null,
        company: match.company ?? null,
      },
    });
  }
  return res.json({
    match: {
      type: "client_contact",
      contactId: match.contactId,
      clientId: match.clientId,
      name: match.name,
      title: match.title ?? null,
      company: match.company ?? null,
    },
  });
}
