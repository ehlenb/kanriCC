import type { VercelRequest, VercelResponse } from "@vercel/node";

import disconnect from "../lib/oauth-handlers/disconnect.js";
import gmailConnect from "../lib/oauth-handlers/gmail-connect.js";
import gmailExchange from "../lib/oauth-handlers/gmail-exchange.js";
import outlookConnect from "../lib/oauth-handlers/outlook-connect.js";
import outlookExchange from "../lib/oauth-handlers/outlook-exchange.js";
import status from "../lib/oauth-handlers/status.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  disconnect,
  "gmail-connect": gmailConnect,
  "gmail-exchange": gmailExchange,
  "outlook-connect": outlookConnect,
  "outlook-exchange": outlookExchange,
  status,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;
  if (!action) return res.status(400).json({ error: "Missing ?action= param" });

  const fn = routes[action];
  if (!fn) return res.status(404).json({ error: `Unknown OAuth action: ${action}` });

  return fn(req, res);
}
