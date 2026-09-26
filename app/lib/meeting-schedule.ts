import { MeetingSettingsVersion } from './api';
import { addDays } from './dates';

/**
 * The meeting-settings version in force for a WEEK — the same rule as the
 * server's `versionForWeek` (common/week-rules.ts), held to the same cases by
 * scripts/check-week-rules.mjs (26 September).
 *
 * A version takes effect on the Monday on or after its date: one schedule per
 * week, so a change dated on a Wednesday does not give that week a second
 * meeting on the new day. Any date of the week may be passed; it is read as
 * its week. Before the first version, the first one applies — the hall's
 * time and place still hold.
 *
 * Every caller in the app already passed a Monday, so nothing on screen moves;
 * what changes is that a caller passing a meeting's own date can no longer
 * start a version a few days early.
 *
 * ISO date strings (YYYY-MM-DD) compare correctly lexicographically.
 */
export function effectiveVersionFor(
  versions: MeetingSettingsVersion[] | undefined,
  anyDateOfWeekISO: string,
): MeetingSettingsVersion | null {
  if (!versions || versions.length === 0) return null;
  const monday = mondayOfISO(anyDateOfWeekISO);
  let best: MeetingSettingsVersion | null = null;
  let earliest: MeetingSettingsVersion | null = null;
  for (const v of versions) {
    if (!earliest || v.effectiveFrom < earliest.effectiveFrom) earliest = v;
    if (v.effectiveFrom <= monday) {
      if (!best || v.effectiveFrom > best.effectiveFrom) best = v;
    }
  }
  return best ?? earliest;
}

/**
 * The first Monday on or after a version's date — the week it actually starts.
 * For the schedule screen: a version dated on a Wednesday is shown as starting
 * the Monday after, because that is when it does.
 */
export function versionStartsOn(effectiveFromISO: string): string {
  const monday = mondayOfISO(effectiveFromISO);
  return monday === effectiveFromISO ? monday : shiftISO(monday, 7);
}

/** Monday of the ISO week of a calendar date, as a calendar date (no time zone). */
function mondayOfISO(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Computes the calendar date of a meeting in a given week.
 * @param weekStartMonday Monday 00:00 of the ISO week.
 * @param dow ISO day-of-week: 1=Mon .. 7=Sun.
 */
export function meetingDate(weekStartMonday: Date, dow: number): Date {
  return addDays(weekStartMonday, dow - 1);
}
