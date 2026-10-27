import type { Absence, MonthDutyMeeting, MonthOfDuties, Publisher } from './api';
import { DUTY_CAPABILITY_KEYS } from './duty-places';

/**
 * WHO CARRIES WHAT — the answers the duties coordinator asked for (Lionel,
 * 27 October 2026): who has nothing this month, and who is still free at one
 * meeting. «Carries» is a duty at a meeting OR a part of its programme;
 * cleaning and the carts are not counted (his decision).
 */

const BAPTISED: ReadonlySet<string> = new Set(['elder', 'ministerial_servant', 'publisher']);

/**
 * The people the duties are drawn from: everybody whose card carries at least
 * one place's mark. A congregation that has marked nobody yet draws from its
 * baptised brothers — the same rule the picker follows.
 */
export function dutyPool(publishers: Publisher[]): Publisher[] {
  const marked = publishers.filter((p) => DUTY_CAPABILITY_KEYS.some((k) => !!p.capabilities?.[k]));
  if (marked.length > 0) return marked;
  return publishers.filter((p) => p.gender === 'brother' && BAPTISED.has(p.appointment));
}

/**
 * Whom a place may be offered to: the card mark it asks for, or — with no
 * mark to go by, or nobody marked yet — baptised brothers. A sister with the
 * mark is offered («в редких случаях — сёстры»).
 */
export function candidatesFor(capability: string | null, publishers: Publisher[]): Publisher[] {
  if (capability) {
    const marked = publishers.filter((p) => !!p.capabilities?.[capability]);
    if (marked.length > 0) return marked;
  }
  return publishers.filter((p) => p.gender === 'brother' && BAPTISED.has(p.appointment));
}

/** The absence covering a day, if any. */
export function absenceOn(absences: Absence[] | undefined, publisherId: string, dateISO: string): Absence | null {
  for (const a of absences ?? []) {
    if (a.publisherId !== publisherId) continue;
    const end = a.endDate ?? a.startDate;
    if (a.startDate <= dateISO && dateISO <= end) return a;
  }
  return null;
}

/** Everybody already standing somewhere at this meeting, or with a part in it. */
export function busyAt(meeting: MonthDutyMeeting): Set<string> {
  const ids = new Set(meeting.partPublisherIds);
  for (const r of meeting.rows) if (r.publisherId) ids.add(r.publisherId);
  return ids;
}

/** «Ещё не задействованы на этой встрече»: from the pool, nobody busy or away. */
export function freeAt(meeting: MonthDutyMeeting, pool: Publisher[], absences: Absence[] | undefined): Publisher[] {
  const busy = busyAt(meeting);
  return pool.filter((p) => !busy.has(p.id) && !absenceOn(absences, p.id, meeting.date));
}

/** «Не задействованы в месяце»: from the pool, nobody with a duty or a part. */
export function idleInMonth(month: MonthOfDuties, pool: Publisher[]): Publisher[] {
  const load = new Map(month.load.map((l) => [l.publisherId, l]));
  return pool.filter((p) => {
    const l = load.get(p.id);
    return !l || (l.duties === 0 && l.parts === 0);
  });
}

/** «Фогт М.» — a cell has room for a surname and an initial. */
export function shortName(p: Pick<Publisher, 'firstName' | 'lastName' | 'displayName'> | undefined): string {
  if (!p) return '—';
  const first = p.firstName?.trim();
  return p.lastName ? `${p.lastName}${first ? ` ${first[0]}.` : ''}` : p.displayName;
}
