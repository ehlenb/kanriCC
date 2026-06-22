export function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}

export function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export function touchTone(
  iso: string | null,
): "fresh" | "warm" | "cool" | "cold" {
  const days = daysSince(iso);
  if (days < 14) return "fresh";
  if (days < 45) return "warm";
  if (days < 120) return "cool";
  return "cold";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatYen(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount >= 1_000_000) return `¥${(amount / 1_000_000).toFixed(1)}M`;
  return `¥${amount.toLocaleString()}`;
}

export function stageOrder(stage: string): number {
  if (stage === "Offer") return 0;
  if (stage === "Placed") return 1;
  // CCM stages: higher round number = further along = more urgent = lower sort order
  const ccm = stage.match(/^CCM(\d+)$/);
  if (ccm) return Math.max(2, 10 - parseInt(ccm[1])); // CCM7→3, CCM3→7, CCM1→9
  if (stage === "CV Sent") return 10;
  if (stage === "Buy-In") return 11;
  if (stage === "Specs Sent") return 12;
  return 99;
}

export function isCcmStage(stage: string): boolean {
  return /^CCM\d+$/.test(stage);
}

export function stageBadgeVariant(
  stage: string,
): "info" | "warning" | "gold" | "success" | "gray" {
  if (stage === "Specs Sent" || stage === "Buy-In") return "warning";
  if (stage === "Offer") return "gold";
  if (stage === "Placed") return "success";
  if (stage === "CV Sent" || isCcmStage(stage)) return "info";
  return "gray";
}

export function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function todayFormatted(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Japan calendar blackout ranges — do not schedule outreach during these periods
const JAPAN_BLACKOUTS: Array<{ month: number; startDay: number; endDay: number }> = [
  { month: 4, startDay: 29, endDay: 30 }, // Golden Week start (Apr)
  { month: 5, startDay: 1,  endDay: 6  }, // Golden Week (May 1–6)
  { month: 8, startDay: 13, endDay: 16 }, // Obon
  { month: 12, startDay: 28, endDay: 31 }, // Year-end
  { month: 1, startDay: 1,  endDay: 4  }, // New Year
];

function isBlackout(d: Date): boolean {
  const m = d.getMonth() + 1; // 1-indexed
  const day = d.getDate();
  return JAPAN_BLACKOUTS.some(
    (r) => r.month === m && day >= r.startDay && day <= r.endDay
  );
}

// Advance date forward to the next business day that falls outside a blackout period
function advanceToWorkday(d: Date): Date {
  const result = new Date(d);
  while (result.getDay() === 0 || result.getDay() === 6 || isBlackout(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Compute the next send date from `from`, adding `delayDays` business days and
 * skipping Japan calendar blackouts (Golden Week, Obon, year-end/new-year).
 */
export function nextSendAt(from: Date, delayDays: number): Date {
  let result = advanceToWorkday(new Date(from));
  let remaining = delayDays;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    result = advanceToWorkday(result);
    remaining--;
  }
  return result;
}

/** True if the current month is a bonus season month (Jan–Mar, Jun–Jul) */
export function isBonusSeason(): boolean {
  const m = new Date().getMonth() + 1;
  return [1, 2, 3, 6, 7].includes(m);
}
