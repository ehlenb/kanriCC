import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

import { refreshCandidate, refreshClient, refreshRequisition } from "../ai-handlers/refresh-context.js";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type QueueJobPayload = {
  msg_id: number;
  entity_type: string;
  entity_id: string;
  triggered_by_interaction_id?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = req.headers["x-internal-secret"];
  if (!process.env.INTERNAL_JOB_SECRET || secret !== process.env.INTERNAL_JOB_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { msg_id, entity_type, entity_id, triggered_by_interaction_id } = req.body as QueueJobPayload;

  if (!msg_id || !entity_type || !entity_id) {
    return res.status(400).json({ error: "Missing msg_id, entity_type, or entity_id" });
  }

  try {
    if (entity_type === "candidate") {
      await refreshCandidate(entity_id, triggered_by_interaction_id);
    } else if (entity_type === "client") {
      await refreshClient(entity_id, triggered_by_interaction_id);
    } else if (entity_type === "requisition") {
      await refreshRequisition(entity_id, triggered_by_interaction_id);
    } else {
      return res.status(400).json({ error: `Unknown entity_type: ${entity_type}` });
    }

    // Job succeeded — remove it from the pgmq queue so it is not retried.
    const { error: completeError } = await supabase.rpc("complete_context_refresh_job", {
      job_msg_id: msg_id,
    });
    if (completeError) {
      // Refresh already succeeded; the row will simply retry harmlessly after
      // its visibility timeout (refresh-context is idempotent). Log and move on.
      console.error(`[process-context-refresh-queue] Failed to delete job ${msg_id}:`, completeError.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    // Leave the message in the queue — it becomes visible again after the
    // visibility timeout and pg_cron will retry it on the next tick.
    const message = err instanceof Error ? err.message : "Context refresh job failed";
    console.error(`[process-context-refresh-queue] Job ${msg_id} (${entity_type}/${entity_id}) failed:`, message);
    return res.status(200).json({ error: message });
  }
}
