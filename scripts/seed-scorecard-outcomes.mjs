/**
 * Wave 4, piece 1 seed step (2026-08-24).
 *
 * Backfills a handful of existing seed processes with terminal outcomes so
 * the new client/hiring-manager scorecard has at least one client that
 * crosses the >=3-terminal-outcome threshold for placements (Salesforce
 * Japan) and one that crosses it for closed-lost categories (Tech Corp
 * Japan) -- without that, the scorecard's rate/percentage rendering path
 * can never be exercised against real data, only its low-N gated path.
 * Deliberately does not touch every client -- unevenness (some clients
 * still thin or cold) matches the existing seed-data roadmap goal.
 *
 * All values here are structured fields (stage, category, fee, dates) set
 * directly, not AI-generated narrative -- consistent with the "no
 * pre-seeded AI output" rule (ai_context/ai_snapshot are untouched).
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

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const WATANABE_ID = "7011ef29-e0aa-4822-bbd6-71437465a0e5"; // Kenji Watanabe, Salesforce Japan
const YAMADA_ID = "5d8c5bcc-6b6e-4df6-8569-65667f023fec"; // Yamada Hanako, Tech Corp Japan

async function updateProcess(id, patch) {
  const { error } = await supabase.from("processes").update(patch).eq("id", id);
  if (error) throw new Error(`processes ${id}: ${error.message}`);
}

async function updateRequisition(id, patch) {
  const { error } = await supabase.from("requisitions").update(patch).eq("id", id);
  if (error) throw new Error(`requisitions ${id}: ${error.message}`);
}

async function main() {
  // 1. Backfill the one pre-existing null-category Closed lost row
  //    (Orion Logistics -- Aiko Inoue). No closed_reason text to infer from.
  await updateProcess("d5b19573-e283-418a-8ba1-01d17c03a625", {
    closed_reason_category: "other",
  });

  // 2. Salesforce Japan -> 3rd placement (Sota Ito, Sales Director)
  await updateProcess("3485e18e-03da-4d19-8e76-f0dda667ac6c", {
    stage: "Placed",
    cv_sent_at: daysAgo(40),
    placed_date: daysAgo(6).slice(0, 10),
    placed_fee_jpy: 5_500_000,
    start_date: daysFromNow(24),
  });
  await updateRequisition("b667e19a-d3ea-4a58-ae1c-466783696975", {
    hiring_manager_id: WATANABE_ID,
  });

  // The other Sales Director finalist loses out once Ito is placed
  await updateProcess("ac0ed3f2-b842-42c3-bf52-ca8969bbd194", {
    stage: "Closed lost",
    closed_reason_category: "client_rejected",
    closed_reason: "Client moved forward with the other finalist for the role.",
  });

  // Fill in the fee that was left blank on Kenji Nakamura's earlier Salesforce placement
  await updateProcess("7fca33b5-b2fe-46c0-bdf0-144a1560df70", {
    placed_fee_jpy: 3_800_000,
  });

  // Bring the still-active Salesforce req under the same hiring manager for consistency
  await updateRequisition("ef6f1c9f-8d75-4490-ac40-45381cf314cd", {
    hiring_manager_id: WATANABE_ID,
  });

  // 3. Tech Corp Japan -> 3 Closed lost, mixed client- and candidate-driven
  await updateProcess("393c790f-6b0c-4419-8b9e-125a4e35113b", {
    stage: "Closed lost",
    ccm_outcome: "fail",
    closed_reason_category: "salary_mismatch",
    closed_reason: "Candidate's floor was above what the team could move on after two rounds.",
  });
  await updateProcess("ef344d3e-ead4-4a67-8166-ac1cc6f074ac", {
    stage: "Closed lost",
    closed_reason_category: "counteroffer",
    closed_reason: "Candidate accepted a counteroffer from their current employer before round 2.",
  });
  await updateRequisition("9c25f393-39f5-456e-84a0-f5338c57fec5", {
    hiring_manager_id: YAMADA_ID,
  });
  await updateRequisition("77e3e625-9dbc-4cf1-85b3-5f38e634edcb", {
    hiring_manager_id: YAMADA_ID,
  });

  console.log("Seeded scorecard outcome data: Salesforce Japan (3 placed, 1 closed lost, HM Watanabe) and Tech Corp Japan (3 closed lost, HM Yamada).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
