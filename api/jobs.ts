import type { VercelRequest, VercelResponse } from "@vercel/node";

import processContextRefreshQueue from "../lib/job-handlers/process-context-refresh-queue.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  "process-refresh-queue": processContextRefreshQueue,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = req.query.type as string | undefined;
  if (!type) return res.status(400).json({ error: "Missing ?type= param" });

  const fn = routes[type];
  if (!fn) return res.status(404).json({ error: `Unknown job type: ${type}` });

  return fn(req, res);
}
