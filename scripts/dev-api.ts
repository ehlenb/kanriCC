/**
 * Local dev API server — replaces `vercel dev` for development.
 * Listens on port 3001. Vite proxies /api/* here.
 *
 * Usage: npm run dev:api   (in a separate terminal from npm run dev)
 */

import http from "node:http";
import { URL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

// Load .env — always overwrite so shell env gaps don't shadow file values
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key) process.env[key] = val; // always set, no guard
  }
  const loaded = ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_URL"]
    .map((k) => `${k}: ${process.env[k] ? "✓" : "MISSING"}`)
    .join("  ");
  console.log(`  Loaded .env  (${loaded})`);
}

const PORT = 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const server = http.createServer(async (req, res) => {
  // CORS headers so the Vite dev server (5173) can reach us
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname; // e.g. /api/ai/extract-candidate

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString();
  let body: unknown = {};
  try {
    body = raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    body = {};
  }

  // ── Build VercelRequest-compatible object ──────────────────────────────────
  const vReq = Object.assign(req, {
    body,
    query: Object.fromEntries(url.searchParams.entries()),
    cookies: {} as Record<string, string>,
  });

  // ── Build VercelResponse-compatible object ─────────────────────────────────
  let headersSent = false;

  const vRes = Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return vRes;
    },
    json(data: unknown) {
      if (!headersSent) {
        headersSent = true;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      }
      return vRes;
    },
    send(data: unknown) {
      if (!headersSent) {
        headersSent = true;
        if (typeof data === "object") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        } else {
          res.end(String(data));
        }
      }
      return vRes;
    },
  });

  // ── Resolve handler file ───────────────────────────────────────────────────
  // pathname "/api/ai/extract-candidate" → ROOT/api/ai/extract-candidate.ts
  const rel = pathname.replace(/^\//, ""); // "api/ai/extract-candidate"
  const handlerPath = path.join(ROOT, `${rel}.ts`);

  try {
    // No cache-bust — Node caches the module after first import (fast).
    // tsx watch restarts the whole process when API files change, clearing the cache.
    const mod = (await import(handlerPath)) as {
      default?: (req: unknown, res: unknown) => Promise<void> | void;
    };

    if (typeof mod.default !== "function") {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `No default export in ${rel}.ts` }));
      return;
    }

    await mod.default(vReq, vRes);

    // If handler didn't send a response, close it
    if (!headersSent && !res.writableEnded) {
      res.end();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dev-api] Error in ${rel}:`, msg);
    if (!headersSent && !res.writableEnded) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: msg }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  Dev API server ready on http://localhost:${PORT}\n`);
});
