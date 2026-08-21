/**
 * Generates mock Vincere-export-shaped CSVs for testing the Kanri import
 * wizard end-to-end: 10 clients, 3 contacts each (30), 200 candidates.
 * Column headers deliberately do NOT match Kanri's schema field names —
 * this is meant to exercise the AI column-mapping step, not a happy-path
 * 1:1 import.
 *
 * Usage: npx tsx scripts/generate-torch-mock-import.ts
 * Output: scripts/mock-import/{clients,contacts,candidates}.csv
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "scripts/mock-import");
fs.mkdirSync(OUT_DIR, { recursive: true });

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

// ── Clients: 10 gaishikei/PE-backed firms hiring in Japan ──────────────────
const CLIENTS = [
  { name: "Meridian Capital Partners K.K.", industry: "Private Equity", country: "USA", kk: "TRUE", size: 45, years: 12 },
  { name: "NordicTech Solutions Japan", industry: "Technology", country: "Sweden", kk: "TRUE", size: 120, years: 8 },
  { name: "Blackfriar Consulting Japan", industry: "Management Consulting", country: "UK", kk: "TRUE", size: 60, years: 15 },
  { name: "Vantage Pharma K.K.", industry: "Pharmaceuticals", country: "Switzerland", kk: "TRUE", size: 200, years: 20 },
  { name: "Sterling Global Bank, Tokyo Branch", industry: "Banking", country: "USA", kk: "FALSE", size: 300, years: 25 },
  { name: "Orion Logistics Japan", industry: "Logistics", country: "Netherlands", kk: "TRUE", size: 80, years: 6 },
  { name: "Halcyon Insurance K.K.", industry: "Insurance", country: "Germany", kk: "TRUE", size: 150, years: 18 },
  { name: "Redwood Software Japan", industry: "Technology", country: "USA", kk: "TRUE", size: 35, years: 4 },
  { name: "Ashford Luxury Group Japan", industry: "Retail", country: "France", kk: "TRUE", size: 90, years: 10 },
  { name: "Continental Materials K.K.", industry: "Manufacturing", country: "Germany", kk: "TRUE", size: 250, years: 22 },
];

const clientHeaders = ["Company", "Sector", "HQ Country", "Japan Entity (KK)", "HC Japan", "Yrs in JP", "Site"];
const clientRows = CLIENTS.map((c) => [
  c.name,
  c.industry,
  c.country,
  c.kk,
  c.size,
  c.years,
  `https://${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.example.com`,
]);
fs.writeFileSync(path.join(OUT_DIR, "clients.csv"), toCsv(clientHeaders, clientRows));

// ── Contacts: 3 per client ──────────────────────────────────────────────────
const CONTACT_FIRST = ["Yuki", "Kenji", "Aiko", "Takeshi", "Naomi", "Hiroshi", "Mei", "Daisuke", "Rina", "Satoshi", "Emma", "James", "Sarah", "David", "Laura"];
const CONTACT_LAST = ["Tanaka", "Yamamoto", "Sato", "Suzuki", "Watanabe", "Ito", "Kobayashi", "Nakamura", "Smith", "Miller", "Johnson", "Brown"];
const ROLES = ["Hiring Manager", "HR / Talent Acquisition", "Executive Sponsor"];
const roleToKanri = ["hiring_manager", "hr_gatekeeper", "executive"];

const contactHeaders = ["Client", "Contact Name", "Job Title", "Function", "Email Address", "Mobile", "Key Contact?"];
const contactRows: (string | number)[][] = [];
CLIENTS.forEach((c, ci) => {
  for (let i = 0; i < 3; i++) {
    const first = CONTACT_FIRST[(ci * 3 + i) % CONTACT_FIRST.length];
    const last = CONTACT_LAST[(ci * 5 + i) % CONTACT_LAST.length];
    const domain = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
    contactRows.push([
      c.name,
      `${first} ${last}`,
      i === 0 ? "Director, Talent" : i === 1 ? "HR Manager" : "General Manager",
      ROLES[i],
      `${first.toLowerCase()}.${last.toLowerCase()}@${domain}.example.com`,
      `080-${1000 + ci * 3 + i}-${2000 + ci}`,
      i === 0 ? "TRUE" : "FALSE",
    ]);
  }
});
fs.writeFileSync(path.join(OUT_DIR, "contacts.csv"), toCsv(contactHeaders, contactRows));
void roleToKanri; // documents intended mapping for the recruiter reviewing suggestions

// ── Candidates: 200 bilingual professionals ─────────────────────────────────
const GIVEN_JP = ["Yuki", "Kenji", "Aiko", "Takeshi", "Naomi", "Hiroshi", "Mei", "Daisuke", "Rina", "Satoshi", "Kaori", "Ryo", "Sakura", "Haruto", "Yui", "Sota", "Ayaka", "Kazuki", "Miyu", "Ren"];
const FAMILY_JP = ["Tanaka", "Yamamoto", "Sato", "Suzuki", "Watanabe", "Ito", "Kobayashi", "Nakamura", "Kato", "Yoshida", "Yamada", "Sasaki", "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu", "Saito", "Mori"];
const FAMILY_JP_KANJI: Record<string, string> = {
  Tanaka: "田中", Yamamoto: "山本", Sato: "佐藤", Suzuki: "鈴木", Watanabe: "渡辺",
  Ito: "伊藤", Kobayashi: "小林", Nakamura: "中村", Kato: "加藤", Yoshida: "吉田",
  Yamada: "山田", Sasaki: "佐々木", Yamaguchi: "山口", Matsumoto: "松本", Inoue: "井上",
  Kimura: "木村", Hayashi: "林", Shimizu: "清水", Saito: "斎藤", Mori: "森",
};
const GIVEN_JP_KANA: Record<string, string> = {
  Yuki: "由紀", Kenji: "健二", Aiko: "愛子", Takeshi: "武", Naomi: "尚美", Hiroshi: "宏",
  Mei: "芽依", Daisuke: "大輔", Rina: "里奈", Satoshi: "聡", Kaori: "香織", Ryo: "涼",
  Sakura: "桜", Haruto: "陽翔", Yui: "結衣", Sota: "颯太", Ayaka: "彩花", Kazuki: "和樹",
  Miyu: "美優", Ren: "蓮",
};
const COMPANIES = ["Mizuho Financial Group", "Sony Corporation", "Toyota Motor Corporation", "Nomura Holdings", "Mitsubishi Corporation", "Rakuten Group", "SoftBank Corp.", "Recruit Holdings", "Hitachi Ltd.", "Panasonic Corporation", "Fast Retailing", "Dentsu Inc.", "ITOCHU Corporation", "Sumitomo Mitsui Banking", "NTT Data Corporation"];
const TITLES = ["Senior Manager", "Business Development Manager", "Account Executive", "Product Manager", "Financial Analyst", "Marketing Manager", "Sales Director", "Operations Manager", "HR Business Partner", "Strategy Consultant", "Data Analyst", "Project Manager"];
const JP_LEVELS = ["Native", "Fluent", "High Business", "Business"];
const EN_LEVELS = ["Fluent", "High Business", "Business", "Low Business"];
const SOURCES = ["LinkedIn", "BizReach", "Referral", "Doda", "Inbound"];

function randInt(min: number, max: number, seed: number): number {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return min + Math.floor(frac * (max - min + 1));
}

const candidateHeaders = [
  "Name (Romaji)",
  "Name (Kanji)",
  "Current Employer",
  "Current Job Title",
  "Email",
  "Mobile Phone",
  "JP Level",
  "EN Level",
  "Current Base Salary (JPY)",
  "Current Bonus (JPY)",
  "Desired Salary Min (JPY)",
  "Desired Salary Max (JPY)",
  "Lead Source",
];

const candidateRows: (string | number)[][] = [];
for (let i = 0; i < 200; i++) {
  const given = GIVEN_JP[i % GIVEN_JP.length];
  const family = FAMILY_JP[(i * 7) % FAMILY_JP.length];
  const company = COMPANIES[randInt(0, COMPANIES.length - 1, i + 1)];
  const title = TITLES[randInt(0, TITLES.length - 1, i + 2)];
  const jpLevel = JP_LEVELS[randInt(0, JP_LEVELS.length - 1, i + 3)];
  const enLevel = EN_LEVELS[randInt(0, EN_LEVELS.length - 1, i + 4)];
  const base = randInt(55, 180, i + 5) * 100000;
  const bonus = Math.round(base * (randInt(0, 30, i + 6) / 100));
  const desiredMin = Math.round(base * 1.05);
  const desiredMax = Math.round(base * 1.25);
  const source = SOURCES[randInt(0, SOURCES.length - 1, i + 7)];

  candidateRows.push([
    `${given} ${family}`,
    `${FAMILY_JP_KANJI[family]} ${GIVEN_JP_KANA[given]}`,
    company,
    title,
    `${given.toLowerCase()}.${family.toLowerCase()}${i}@example.com`,
    `090-${1000 + i}-${5000 + i}`,
    jpLevel,
    enLevel,
    base,
    bonus,
    desiredMin,
    desiredMax,
    source,
  ]);
}
fs.writeFileSync(path.join(OUT_DIR, "candidates.csv"), toCsv(candidateHeaders, candidateRows));

console.log(`Wrote ${CLIENTS.length} clients, ${contactRows.length} contacts, ${candidateRows.length} candidates to ${OUT_DIR}`);
