/**
 * One-off seed fix (2026-08-23).
 *
 * Kenji Nakamura's "Placed" process on the Salesforce Japan Senior Account
 * Executive requisition was inserted directly as historical mock data,
 * bypassing the app's normal stage-change flow -- so no interaction trail
 * ever got created for it. In real usage, useStageChange auto-logs a
 * "Placed" entry (and everything before it is logged as it happens);
 * this backfills an equivalent trail for the seed candidate so the
 * timeline tells a coherent story in a demo.
 *
 * All narrative text authored here, not AI-generated -- same convention as
 * scripts/enrich-mock-candidates.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const envLines = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/);
for (const line of envLines) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CANDIDATE_ID = "c563c92d-edd8-432b-b58f-1aa7c57c074f"; // Kenji Nakamura (Amazon Robotics)
const CLIENT_ID = "0de0ac68-6f00-4840-8177-8d66443833c2"; // Salesforce Japan
const REQUISITION_ID = "8a121759-473a-4ae8-822f-400cb977c14f"; // Senior Account Executive — Enterprise
const PROCESS_ID = "7fca33b5-b2fe-46c0-bdf0-144a1560df70";
const RECRUITER_ID = "48bd1ce0-d66f-49da-bbd2-53fca0d83bb6";
// team_id's column default is current_team_id(), which reads the auth JWT --
// there is none under a service-role script, so it silently resolves to
// NULL and RLS then hides the row from every authenticated session. Must be
// set explicitly here (same team_id as RECRUITER_ID in this single-team dev
// environment).
const TEAM_ID = "48bd1ce0-d66f-49da-bbd2-53fca0d83bb6";
const WATANABE_CONTACT_ID = "7011ef29-e0aa-4822-bbd6-71437465a0e5"; // Kenji Watanabe, VP Enterprise Sales

const iso = (d) => new Date(`${d}T09:00:00Z`).toISOString();

const trail = [
  {
    interacted_at: iso("2026-06-01"),
    interaction_type: "call",
    primary_party: "candidate",
    direction: "outbound",
    summary: "Registration call",
    full_notes: "Initial call to understand background, motivations, and target comp. Strong enterprise sales background at Amazon Robotics; open to the right move if comp and scope line up.",
  },
  {
    interacted_at: iso("2026-06-03"),
    interaction_type: "job spec sent",
    primary_party: "candidate",
    direction: "outbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    summary: "Sent Salesforce AE spec",
    full_notes: "Sent the Senior Account Executive — Enterprise spec at Salesforce Japan. Strong interest, especially in the uncapped commission structure and enterprise account scope.",
  },
  {
    interacted_at: iso("2026-06-05"),
    interaction_type: "call",
    primary_party: "candidate",
    direction: "outbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    summary: "Buy-in confirmed",
    full_notes: "Confirmed buy-in to submit CV to Salesforce Japan for the Senior Account Executive role.",
  },
  {
    interacted_at: iso("2026-06-08"),
    interaction_type: "email",
    primary_party: "client",
    direction: "outbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    contact_id: WATANABE_CONTACT_ID,
    summary: "CV submitted to Salesforce Japan",
    full_notes: "Submitted Kenji Nakamura's CV to Kenji Watanabe (VP Enterprise Sales, Japan) for the Senior Account Executive — Enterprise role.",
  },
  {
    interacted_at: iso("2026-06-11"),
    interaction_type: "ccm1",
    primary_party: "candidate",
    direction: "outbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    process_id: PROCESS_ID,
    contact_id: WATANABE_CONTACT_ID,
    summary: "First-round interview",
    full_notes: "First-round interview with Kenji Watanabe (VP Enterprise Sales). Went well — Watanabe liked the direct enterprise sales background at Amazon Robotics and the account management track record.",
  },
  {
    interacted_at: iso("2026-06-15"),
    interaction_type: "email",
    primary_party: "client",
    direction: "inbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    process_id: PROCESS_ID,
    contact_id: WATANABE_CONTACT_ID,
    summary: "Client confirmed offer intent",
    full_notes: "Watanabe confirmed the team wants to move forward with an offer. Comp discussion to follow.",
  },
  {
    interacted_at: iso("2026-06-18"),
    interaction_type: "call",
    primary_party: "candidate",
    direction: "outbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    process_id: PROCESS_ID,
    summary: "Offer discussion",
    full_notes: "Walked through the offer terms. No competing counteroffer risk — current employer aware he's been looking, no retention conversation happening. Verbally accepting.",
  },
  {
    interacted_at: iso("2026-06-20"),
    interaction_type: "note",
    primary_party: "candidate",
    direction: "outbound",
    requisition_id: REQUISITION_ID,
    client_id: CLIENT_ID,
    process_id: PROCESS_ID,
    summary: "Placed",
    full_notes: "Placed as Senior Account Executive — Enterprise at Salesforce Japan.",
  },
];

async function main() {
  // Clean up any prior run (e.g. the first run of this script, before
  // team_id was set explicitly and every row silently became invisible to
  // RLS) so re-running is idempotent instead of duplicating or skipping.
  const { error: deleteError } = await supabase
    .from("interactions")
    .delete()
    .eq("candidate_id", CANDIDATE_ID)
    .eq("requisition_id", REQUISITION_ID);
  if (deleteError) throw deleteError;

  const rows = trail.map((entry) => ({
    candidate_id: CANDIDATE_ID,
    recruiter_id: RECRUITER_ID,
    team_id: TEAM_ID,
    ...entry,
  }));

  const { error } = await supabase.from("interactions").insert(rows);
  if (error) throw error;

  console.log(`Inserted ${rows.length} interactions for Kenji Nakamura's Salesforce Japan placement.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
