import type { VercelRequest, VercelResponse } from "@vercel/node";

import suggestMapping from "../lib/import-handlers/suggest-mapping.js";
import commit from "../lib/import-handlers/commit.js";
import rollback from "../lib/import-handlers/rollback.js";
import history from "../lib/import-handlers/history.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  "suggest-mapping": suggestMapping,
  commit,
  rollback,
  history,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined;
  if (!action) return res.status(400).json({ error: "Missing ?action= param" });

  const fn = routes[action];
  if (!fn) return res.status(404).json({ error: `Unknown import action: ${action}` });

  return fn(req, res);
}
