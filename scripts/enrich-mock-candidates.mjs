/**
 * Phase 2 seed data enrichment (2026-08-23).
 *
 * Populates notes_interview (recruiter-voice narrative, the load-bearing
 * intelligence field per the AI pipeline redesign) and diversifies
 * candidate_status across the existing mock candidate set, plus sprinkles
 * a handful of competing_interviews. Does NOT seed candidate_motivations /
 * candidate_blockers directly — per CLAUDE.md, notes/documents are the
 * source of truth going forward, those tables are additive only.
 *
 * All narrative text is authored here (sentence pools combined per
 * candidate from their real fields), not generated via any AI API call —
 * this is synthetic seed data, not product output.
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

// ── seeded RNG so the run is reproducible ──────────────────────────────────
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
}

function formatYen(n) {
  if (!n) return null;
  return `¥${(n / 1_000_000).toFixed(1)}M`;
}

// ── sentence-pool building blocks ──────────────────────────────────────────

const OPENERS = [
  (c) => `Caught up with ${c.first} again. `,
  (c) => `Had a longer chat with ${c.first} this time. `,
  (c) => `${c.first} was in a talkative mood today. `,
  (c) => `Quick call with ${c.first} — good signal. `,
  (c) => `Sat down properly with ${c.first} for the first time. `,
  (c) => `Followed up with ${c.first} after the market update I sent. `,
];

const CAREER_FRAMES = [
  (c) => `Been at ${c.company} for a while now as ${c.title}, and the day-to-day has flattened out — not much new to learn there anymore.`,
  (c) => `Solid track record at ${c.company} as ${c.title}, but promotion is stuck behind someone who isn't moving on for years.`,
  (c) => `${c.title} at ${c.company} suits their skillset well, though the scope hasn't grown much in the last couple of years.`,
  (c) => `Comfortable at ${c.company}, respected as ${c.title}, but honestly a bit bored — wants a bigger stage.`,
  (c) => `Doing well as ${c.title} at ${c.company}, but the org restructured last year and reporting lines got messier.`,
  (c) => `Strong reputation internally at ${c.company}, ${c.title} role is stable, but growth from here means waiting years for the next opening.`,
];

const MOTIVATION_SENTENCES = [
  (c) => `Main driver is scope — wants ownership over a bigger piece of the business than ${c.first} currently has.`,
  (c) => `Compensation is a real factor here; feels underpaid relative to peers doing similar work elsewhere.`,
  (c) => `Wants exposure to a global structure rather than a purely domestic reporting line.`,
  (c) => `Looking for a foreign firm specifically — tired of seniority-based promotion and wants to be judged on results.`,
  (c) => `Family situation is stable now, so ${c.first} is finally open to a move after holding off for a couple of years.`,
  (c) => `Genuinely curious about a new industry, not just chasing title or money.`,
  (c) => `Wants better work-life balance — current role has had brutal hours for the last year.`,
  (c) => `Management style at the current company is old-school top-down and it's wearing on them.`,
  (c) => `Would like to build a team from scratch rather than inherit someone else's.`,
  (c) => `Cares more about brand name and stability than a big compensation jump.`,
];

const BLOCKER_SENTENCES = [
  (c) => `One thing to watch: base salary is the hard floor for ${c.first}, total comp flexibility matters less.`,
  (c) => `Notice period could be an issue if a client needs someone fast.`,
  (c) => `Spouse works locally too, so relocation outside greater Tokyo is a non-starter.`,
  (c) => `Still has some loyalty to the current manager, which could slow down a final decision.`,
  (c) => `Mentioned being cautious about "foreign firm instability" — worth addressing early with the objection-handling framework.`,
  (c) => `Nothing major flagged yet — seems genuinely ready to move when the right role appears.`,
  (c) => `A bit sensitive about job-hopping perception given the last two moves were fairly close together.`,
];

const CLOSING_SENTENCES = [
  (c) => `Overall reads as passive but genuinely open — worth keeping warm with relevant roles rather than pushing hard.`,
  (c) => `Reads as more active than the status field suggests — would move quickly for the right fit.`,
  (c) => `Still early days; needs another touchpoint or two before pitching anything specific.`,
  (c) => `Good rapport building. Next step is to share a role that actually maps to what ${c.first} said matters.`,
  (c) => `Ready to move on the right opportunity — just hasn't seen one yet that clears the bar.`,
];

function buildNotesInterview(c, rngIndex) {
  const opener = OPENERS[rngIndex % OPENERS.length](c);
  const career = pick(CAREER_FRAMES)(c);
  const motivations = pickN(MOTIVATION_SENTENCES, 2).map((f) => f(c)).join(" ");
  const blocker = pick(BLOCKER_SENTENCES)(c);
  const closing = pick(CLOSING_SENTENCES)(c);

  const compLine = c.current_total
    ? `Currently around ${formatYen(c.current_total)} total comp.`
    : "";
  const expLine = c.expected_total_min || c.expected_total_max
    ? `Looking for roughly ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}.`
    : "";

  return [opener + career, motivations, [compLine, expLine].filter(Boolean).join(" "), blocker, closing]
    .filter(Boolean)
    .join("\n\n");
}

const COMPETING_COMPANIES = [
  "Rakuten Group", "SoftBank Corp.", "Amazon Japan", "Google Japan", "Accenture Japan",
  "McKinsey & Company", "Bain & Company", "Deloitte Tohmatsu", "PwC Japan", "EY Japan",
];
const COMPETING_SOURCES = ["linkedin", "bizreach", "referral", "direct approach"];
const COMPETING_STAGES = ["First interview", "Second interview", "Final round", "Screening"];

async function main() {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, full_name, current_company, current_title, current_total, expected_total_min, expected_total_max, candidate_status, notes_interview")
    .order("full_name");
  if (error) throw error;

  console.log(`Fetched ${candidates.length} candidates.`);

  // ── status distribution ──────────────────────────────────────────────────
  // Keep already-placed candidates as-is. Among the rest: ~18% active, ~82% passive.
  const toUpdate = [];
  let activeCount = 0;
  let notesCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.candidate_status === "placed") continue;

    const first = c.full_name.split(" ")[0] || c.full_name;
    const ctx = {
      first,
      company: c.current_company ?? "their current company",
      title: c.current_title ?? "their current role",
      current_total: c.current_total,
      expected_total_min: c.expected_total_min,
      expected_total_max: c.expected_total_max,
    };

    const newStatus = rand() < 0.18 ? "active" : "passive";
    if (newStatus === "active") activeCount++;

    let notesInterview = c.notes_interview;
    if (!notesInterview || notesInterview.trim() === "") {
      notesInterview = buildNotesInterview(ctx, i);
      notesCount++;
    }

    toUpdate.push({ id: c.id, candidate_status: newStatus, notes_interview: notesInterview });
  }

  console.log(`Assigning: ${activeCount} active, ${toUpdate.length - activeCount} passive (${candidates.length - toUpdate.length} already placed, unchanged).`);
  console.log(`Writing notes_interview for ${notesCount} candidates.`);

  // Batch update in chunks
  const CHUNK = 25;
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((row) =>
        supabase
          .from("candidates")
          .update({ candidate_status: row.candidate_status, notes_interview: row.notes_interview })
          .eq("id", row.id),
      ),
    );
    console.log(`  updated ${Math.min(i + CHUNK, toUpdate.length)} / ${toUpdate.length}`);
  }

  // ── competing interviews on a handful of candidates ─────────────────────
  const { data: existingCompeting } = await supabase.from("competing_interviews").select("candidate_id");
  const alreadyHas = new Set((existingCompeting ?? []).map((r) => r.candidate_id));
  const eligible = candidates.filter((c) => c.candidate_status !== "placed" && !alreadyHas.has(c.id));
  const chosen = pickN(eligible, 4);

  for (const c of chosen) {
    const disclosedDaysAgo = Math.floor(rand() * 14) + 1;
    const disclosedAt = new Date(Date.now() - disclosedDaysAgo * 86_400_000).toISOString().slice(0, 10);
    await supabase.from("competing_interviews").insert({
      candidate_id: c.id,
      company_name: pick(COMPETING_COMPANIES),
      source: pick(COMPETING_SOURCES),
      stage: pick(COMPETING_STAGES),
      disclosed_at: disclosedAt,
      is_active: true,
    });
  }
  console.log(`Added competing_interviews for ${chosen.length} candidates: ${chosen.map((c) => c.full_name).join(", ")}`);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
