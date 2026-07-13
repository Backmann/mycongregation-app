import type { PioneerType, PublisherHistoryEntry } from './api';

// Annual hour goals by pioneer type (service year Sep–Aug).
const ANNUAL_GOAL: Partial<Record<PioneerType, number>> = {
  regular: 600,
  special: 800,
  missionary: 800,
};
const MONTHLY_GOAL: Partial<Record<PioneerType, number>> = {
  regular: 50,
  special: 67,
  missionary: 67,
};

export interface PioneerProgress {
  /** Hours reported so far this service year. */
  hours: number;
  /** Pro-rated goal for the months the person has been a pioneer this year. */
  goalToDate: number;
  /** Full-year goal (e.g. 600 for a regular pioneer). */
  annualGoal: number;
  /** Whether they are at or above the pro-rated pace. */
  onTrack: boolean;
  /** Months counted so far (from start month through the current month). */
  monthsCounted: number;
}

/** The service year a date belongs to (Sep starts a new year). */
function serviceYearOf(d: Date): number {
  return d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

/** "YYYY-MM" for a service-year month index (0 = Sep .. 11 = Aug). */
function ymOfServiceMonth(serviceYear: number, idx: number): string {
  const monthIdx = idx >= 4 ? idx - 4 : idx + 8; // 0->Sep(8) ... 11->Aug(7)
  const year = idx >= 4 ? serviceYear : serviceYear - 1;
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}

/**
 * Pro-rated pioneer progress for the current service year. A pioneer who began
 * mid-year is measured against a goal scaled to the months they've served, so
 * they aren't shown as "behind" for months before they started.
 *
 * Returns null if the person isn't a pioneer type with a goal.
 */
export function pioneerProgress(
  pioneerType: PioneerType,
  pioneerSince: string | null,
  timeline: PublisherHistoryEntry[],
  now = new Date(),
): PioneerProgress | null {
  const annualGoal = ANNUAL_GOAL[pioneerType];
  const monthlyGoal = MONTHLY_GOAL[pioneerType];
  if (annualGoal == null || monthlyGoal == null) return null;

  const serviceYear = serviceYearOf(now);
  const yearStartYm = `${serviceYear - 1}-09`;
  // The current month isn't finished (no report yet), so measure through the
  // previous month — otherwise a pioneer looks "behind" for the open month.
  const prev = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const throughYm = `${prev.getUTCFullYear()}-${String(
    prev.getUTCMonth() + 1,
  ).padStart(2, '0')}`;

  // Start month within this service year: the later of September and the month
  // they became a pioneer (if that was during this service year).
  let startYm = yearStartYm;
  if (pioneerSince) {
    const sinceYm = pioneerSince.slice(0, 7);
    if (sinceYm > startYm && sinceYm <= throughYm) startYm = sinceYm;
  }

  // Sum reported hours from startYm through the last completed month.
  const byMonth = new Map<string, number>();
  for (const e of timeline) {
    byMonth.set(e.reportMonth.slice(0, 7), e.report?.hoursReported ?? 0);
  }

  let hours = 0;
  let monthsCounted = 0;
  for (let idx = 0; idx < 12; idx++) {
    const ym = ymOfServiceMonth(serviceYear, idx);
    if (ym < startYm) continue;
    if (ym > throughYm) break;
    monthsCounted++;
    hours += byMonth.get(ym) ?? 0;
  }

  const goalToDate = monthsCounted * monthlyGoal;
  return {
    hours,
    goalToDate,
    annualGoal,
    onTrack: hours >= goalToDate,
    monthsCounted,
  };
}
