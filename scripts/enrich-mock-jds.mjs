/**
 * Mock data enrichment: realistic job descriptions for requisitions missing one.
 *
 * Authored here (sentence pools combined per-job from real fields — title,
 * client, salary, location), not generated via any AI API call. Sets
 * requisitions.jd_text only; no file is stored (jd_url stays null), so these
 * render through the plain-text fallback in JdViewer until a recruiter
 * uploads a real PDF/Word doc.
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

let seed = 7;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}
function formatYen(n) { return n ? `¥${(n / 1_000_000).toFixed(1)}M` : null; }

const ABOUT_TEMPLATES = [
  (c) => `${c.company} has built a strong presence in the Japan market and continues to grow its local team. This is an opportunity to join a business with real scope for ownership, not just execution.`,
  (c) => `${c.company} is a well-established name in its sector with a stable footprint in Japan. The team is looking for someone who can operate independently and bring structure to a growing area of the business.`,
  (c) => `${c.company} combines the resources of a large organization with a lean, fast-moving local team in Japan. This role sits close to leadership and has real influence over how the Japan business develops.`,
  (c) => `${c.company} is scaling its Japan operations and this role is part of that next phase of growth. Expect a mix of hands-on execution and strategic input from day one.`,
];

const RESPONSIBILITY_POOLS = {
  default: [
    "Own day-to-day execution across your area of responsibility, working closely with cross-functional stakeholders in Japan and globally.",
    "Build and maintain relationships with key internal and external stakeholders, acting as a trusted point of contact.",
    "Identify gaps in current process and propose practical improvements, not just flag problems.",
    "Report on progress and results to leadership on a regular cadence, in both Japanese and English where needed.",
    "Support the wider team during periods of high volume, without losing attention to detail.",
  ],
  Sales: [
    "Own a book of accounts end to end — from prospecting through to close and account growth.",
    "Build a pipeline through a mix of outbound activity, referrals, and inbound leads.",
    "Negotiate commercial terms directly with clients, balancing growth with margin discipline.",
    "Work closely with marketing and product to feed client feedback back into the business.",
    "Hit and exceed quarterly revenue targets while maintaining a healthy, forecastable pipeline.",
  ],
  Marketing: [
    "Plan and execute integrated marketing campaigns tailored to the Japan market.",
    "Localize global marketing assets and messaging without losing brand consistency.",
    "Manage relationships with local agencies, media partners, and vendors.",
    "Track campaign performance and report on ROI to regional and global stakeholders.",
    "Partner closely with sales to ensure marketing activity translates into pipeline.",
  ],
  Operations: [
    "Own operational processes end to end, identifying and closing inefficiencies as they arise.",
    "Partner with cross-functional teams to ensure smooth day-to-day execution across the business.",
    "Build reporting and dashboards that give leadership real visibility into operational health.",
    "Lead process improvement initiatives from scoping through to rollout.",
    "Manage vendor and partner relationships that support core operations.",
  ],
  "Business Development": [
    "Identify and prioritize new business opportunities aligned with company strategy.",
    "Build relationships with prospective partners and clients from first contact through signed agreement.",
    "Work cross-functionally with product and legal to structure and close new deals.",
    "Represent the company at industry events and build the external network in Japan.",
    "Track and report on pipeline health and deal progress to leadership.",
  ],
  Account: [
    "Manage a portfolio of client accounts, acting as their primary point of contact.",
    "Identify upsell and cross-sell opportunities within the existing client base.",
    "Resolve client escalations quickly and professionally, looping in internal stakeholders as needed.",
    "Prepare and deliver regular business reviews with key accounts.",
    "Maintain accurate account records and forecasts in the CRM.",
  ],
  Data: [
    "Design and maintain reporting that gives stakeholders clear, actionable insight.",
    "Partner with business teams to translate ambiguous questions into concrete analysis.",
    "Own data quality within your area, flagging and resolving issues proactively.",
    "Present findings to non-technical stakeholders in a clear, decision-oriented way.",
    "Support ad hoc analysis requests from leadership with quick turnaround.",
  ],
  Product: [
    "Own the roadmap for your product area, balancing user needs with business priorities.",
    "Work closely with engineering and design to ship features that solve real problems.",
    "Gather and synthesize feedback from users, sales, and support into clear requirements.",
    "Define and track success metrics for features after launch.",
    "Communicate roadmap and trade-offs clearly to stakeholders across the business.",
  ],
  Strategy: [
    "Lead structured analysis on key strategic questions facing the Japan business.",
    "Partner directly with leadership to shape and prioritize the strategic agenda.",
    "Build business cases for new initiatives, including market sizing and financial modeling.",
    "Track execution against strategic priorities and flag risks early.",
    "Represent the Japan business in conversations with regional and global leadership.",
  ],
  HR: [
    "Partner with business leaders on org design, performance management, and talent planning.",
    "Own end-to-end recruitment coordination for your client group.",
    "Advise managers on employee relations matters in line with Japan labor law.",
    "Drive engagement and retention initiatives tailored to the local team.",
    "Support compensation benchmarking and annual review cycles.",
  ],
  Financial: [
    "Own financial modeling and analysis supporting key business decisions.",
    "Partner with business leaders to build and track budgets.",
    "Prepare materials for leadership and board-level financial reviews.",
    "Identify cost and efficiency opportunities across the business.",
    "Support monthly close and variance analysis in partnership with accounting.",
  ],
};

function pickResponsibilityPool(title) {
  for (const key of Object.keys(RESPONSIBILITY_POOLS)) {
    if (key !== "default" && title.includes(key)) return RESPONSIBILITY_POOLS[key];
  }
  return RESPONSIBILITY_POOLS.default;
}

const REQUIREMENT_TEMPLATES = [
  (c) => `${c.minYears}+ years of relevant experience, ideally including time in Japan.`,
  (c) => `Business-level Japanese and English required — this role works across both local and global stakeholders.`,
  (c) => `Comfortable operating with ambiguity and taking ownership without heavy oversight.`,
  (c) => `Track record of working cross-functionally in a matrixed organization.`,
  (c) => `Prior experience at a foreign or multinational company in Japan is a plus but not required.`,
];

const CLOSING_LINES = [
  "This is a high-visibility role with a clear path for growth as the Japan business scales.",
  "The team is small enough that individual contribution is highly visible to leadership.",
  "Compensation is competitive and includes performance-based bonus.",
  "Hybrid working model, with flexibility based on business need.",
];

async function main() {
  const { data: reqs, error } = await supabase
    .from("requisitions")
    .select("id, title, location, salary_min, salary_max, salary_range_text, is_backfill, jd_text, clients ( company_name )")
    .order("title");
  if (error) throw error;

  console.log(`Fetched ${reqs.length} requisitions.`);

  const toUpdate = reqs.filter((r) => !r.jd_text || r.jd_text.trim() === "");
  console.log(`${toUpdate.length} missing a JD. Writing now.`);

  for (const r of toUpdate) {
    const company = r.clients?.company_name ?? "the client";
    const salaryLine = r.salary_range_text
      ?? (r.salary_min || r.salary_max ? `${formatYen(r.salary_min) ?? "—"}–${formatYen(r.salary_max) ?? "—"}` : "Competitive, based on experience");
    const minYears = pick([3, 4, 5, 6, 8]);

    const about = pick(ABOUT_TEMPLATES)({ company });
    const pool = pickResponsibilityPool(r.title);
    const responsibilities = pickN(pool, 4);
    const requirements = pickN(REQUIREMENT_TEMPLATES, 3).map((f) => f({ minYears }));
    const closing = pick(CLOSING_LINES);
    const backfillLine = r.is_backfill ? "This is a backfill for a departing team member." : "This is a newly created headcount reflecting continued growth.";

    const jdText = `${r.title} — ${company}

Location: ${r.location ?? "Tokyo"}
Compensation: ${salaryLine}

About the Role
${about} ${backfillLine}

Key Responsibilities
${responsibilities.map((line) => `- ${line}`).join("\n")}

Requirements
${requirements.map((line) => `- ${line}`).join("\n")}

${closing}`;

    const { error: updateError } = await supabase
      .from("requisitions")
      .update({ jd_text: jdText })
      .eq("id", r.id);
    if (updateError) {
      console.error(`  failed for ${r.title} (${company}):`, updateError.message);
    } else {
      console.log(`  wrote JD for ${r.title} — ${company}`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
