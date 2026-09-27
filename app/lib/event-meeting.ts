import type { MeetingSettingsVersion, SpecialEvent } from './api';
import { addDays, formatDateISO } from './dates';
import { effectiveVersionFor } from './meeting-schedule';
import { weekRules } from './week-rules';

/**
 * How the congregation meeting goes on an event's day (27 September).
 *
 * Three answers — as usual, with changes, no meeting — for the events that
 * have no rule of their own: a branch representative's visit and «Other». A
 * convention, the Memorial and a circuit visit decide the meeting themselves.
 * The same list as the server's meeting-mode.ts.
 */
const OWN_RULE_TYPES = new Set([
  'regional_convention',
  'circuit_assembly',
  'memorial',
  'circuit_overseer_visit',
]);

export function takesMeetingMode(type: string | null | undefined): boolean {
  return !OWN_RULE_TYPES.has(type ?? '');
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  return formatDateISO(addDays(d, 1 - dow));
}

/**
 * The congregation's meetings that fall on the days an event covers, by the
 * settings in force. The form asks this to know whether «how does the
 * meeting go» is a question at all: an event on a Wednesday afternoon, with
 * the meetings on Thursday and Sunday, has no meeting to answer about.
 *
 * Only the settings, not the other events: the question is about this
 * event's own days.
 */
export function meetingDaysCovered(
  date: string,
  endDate: string | null | undefined,
  versions: MeetingSettingsVersion[] | undefined,
): { date: string; kind: 'midweek' | 'weekend' }[] {
  if (!date || !versions || versions.length === 0) return [];
  const last = endDate && endDate >= date ? endDate : date;
  const out: { date: string; kind: 'midweek' | 'weekend' }[] = [];
  let day = new Date(`${date}T00:00:00`);
  // A fortnight is more than any event of these kinds lasts.
  for (let i = 0; i < 14; i++, day = addDays(day, 1)) {
    const iso = formatDateISO(day);
    if (iso > last) break;
    const week = mondayOf(iso);
    const rules = weekRules({
      weekStartISO: week,
      version: effectiveVersionFor(versions, week),
      events: [],
    });
    for (const kind of ['midweek', 'weekend'] as const) {
      if (rules.dateOf(kind) === iso) out.push({ date: iso, kind });
    }
  }
  return out;
}

/** The event that changes the meeting on this day, if any. */
export function meetingChangeOn(
  events: SpecialEvent[] | undefined,
  dateISO: string,
): SpecialEvent | null {
  return (
    (events ?? []).find(
      (e) =>
        e.meetingMode === 'changed' &&
        takesMeetingMode(e.type) &&
        e.date <= dateISO &&
        (e.endDate ?? e.date) >= dateISO,
    ) ?? null
  );
}
