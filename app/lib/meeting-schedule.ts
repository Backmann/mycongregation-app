import { MeetingSettingsVersion } from './api';
import { addDays } from './dates';

/**
 * Picks the meeting-settings version effective on a given date.
 * A version is effective from its `effectiveFrom` (inclusive) until the next
 * version's start. Returns the version with the latest `effectiveFrom` that is
 * still <= the target date, or null if none applies yet.
 *
 * ISO date strings (YYYY-MM-DD) compare correctly lexicographically.
 */
export function effectiveVersionFor(
  versions: MeetingSettingsVersion[] | undefined,
  dateISO: string,
): MeetingSettingsVersion | null {
  if (!versions || versions.length === 0) return null;
  let best: MeetingSettingsVersion | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= dateISO) {
      if (!best || v.effectiveFrom > best.effectiveFrom) best = v;
    }
  }
  return best;
}

/**
 * Computes the calendar date of a meeting in a given week.
 * @param weekStartMonday Monday 00:00 of the ISO week.
 * @param dow ISO day-of-week: 1=Mon .. 7=Sun.
 */
export function meetingDate(weekStartMonday: Date, dow: number): Date {
  return addDays(weekStartMonday, dow - 1);
}
