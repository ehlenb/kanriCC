import type { VercelRequest, VercelResponse } from "@vercel/node";

import logEmail from "../lib/addin-handlers/log-email.js";
import matchSender from "../lib/addin-handlers/match-sender.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  "log-email": logEmail,
  "match-sender": matchSender,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;
  if (!action) return res.status(400).json({ error: "Missing ?action= param" });

  const fn = routes[action];
  if (!fn) return res.status(404).json({ error: `Unknown addin action: ${action}` });

  return fn(req, res);
}
