import type { VercelRequest, VercelResponse } from "@vercel/node";

import recall from "../lib/webhook-handlers/recall.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  recall,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = req.query.type as string | undefined;
  if (!type) return res.status(400).json({ error: "Missing ?type= param" });

  const fn = routes[type];
  if (!fn) return res.status(404).json({ error: `Unknown webhook type: ${type}` });

  return fn(req, res);
}
