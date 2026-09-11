import type { InsightsPeriods, InsightsPreset, OperationalMetric } from "./analytics";

const DAY = 86_400_000;
const IST = 19_800_000;
const iso = (time: number) => new Date(time).toISOString();

// Insights §15: civil dates use Bengaluru time, inclusive start / exclusive end.
export function insightsPeriods(preset: InsightsPreset, now = new Date(), from?: string, to?: string): InsightsPeriods {
  const civil = new Date(now.getTime() + IST);
  const today = Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate()) - IST;
  let start = today, end = today + DAY, previousStart: number, previousEnd: number;
  let label = "vs yesterday";
  if (preset === "last7" || preset === "last30") {
    const days = preset === "last7" ? 7 : 30;
    start = end - days * DAY;
    label = `vs previous ${days} days`;
  } else if (preset === "week") {
    start = today - ((civil.getUTCDay() + 6) % 7) * DAY;
    end = start + 7 * DAY;
    label = "vs last week";
  } else if (preset === "month") {
    start = Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), 1) - IST;
    end = Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth() + 1, 1) - IST;
    label = "vs last month";
  } else if (preset === "custom") {
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Choose both custom dates");
    start = Date.parse(`${from}T00:00:00+05:30`);
    end = Date.parse(`${to}T00:00:00+05:30`) + DAY;
    if (!Number.isFinite(start + end) || iso(start + IST).slice(0, 10) !== from || iso(end - DAY + IST).slice(0, 10) !== to || start >= end) throw new Error("Invalid custom period");
    if (end - start > 366 * DAY || start > now.getTime()) throw new Error("Choose a period of at most 366 days starting today or earlier");
    label = "vs previous equivalent period";
  }
  previousEnd = start;
  previousStart = preset === "month" ? Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth() - 1, 1) - IST : start - (end - start);
  return { current: { from: iso(start), to: iso(end) }, previous: { from: iso(previousStart), to: iso(previousEnd) }, label, timeZone: "Asia/Kolkata", partial: end > now.getTime() };
}

export function compareInsight(value: number | null, previous: number | null, direction: OperationalMetric["direction"], unit: OperationalMetric["unit"]): OperationalMetric["comparison"] {
  if (value === null || previous === null) return { change: null, relativePercent: null, interpretation: "No comparable data" };
  const change = Math.round((value - previous) * 10) / 10;
  const relativePercent = unit === "hours" && previous > 0 ? Math.round((previous - value) / previous * 1000) / 10 : null;
  return { change, relativePercent, interpretation: direction === "context" ? "Context only" : change === 0 ? "Unchanged" : (direction === "higher" ? change > 0 : change < 0) ? "Improved" : "Declined" };
}
