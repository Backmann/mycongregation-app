/**
 * What Home puts at the top (26 September): «Ваше ближайшее» — the person's
 * next own assignment — the one after it, how many more lie beyond the two
 * weeks, and the big events coming after them.
 *
 * Built on the stream `buildTimeline` already makes, so the card and the list
 * under it can never disagree about what is the person's: the card is the
 * first of the list's own rows, not a second reading of the data.
 *
 * Decisions it carries (Lionel, 20 and 26 September):
 *  - the NEAREST in time; a duty counts (a microphone is what he comes early
 *    for), and so does chairing — it is a part of the programme like any
 *    other (26 September, replacing «the chairman does not count»);
 *  - on a tie a part of the programme goes before a duty — the builder
 *    already orders a meeting's lines that way;
 *  - a meeting of today that is over is no longer «ближайшее»;
 *  - an assignment that falls inside the person's own away-period is said to
 *    be so, not shown as if nothing were wrong.
 *
 * Pure: no React, no translations — scripts/check-home-digest.mjs runs it.
 */
import type { Absence, SpecialEvent } from './api';
import { addDays, formatDateISO } from './dates';
import type { DayGroup, Timeline, TimelineEntry } from './home-timeline';
import { isCongressEvent } from './week-rules';

/** A meeting is taken as over this long after it starts. */
export const MEETING_LENGTH_MIN = 105;
/** How far ahead «Скоро» looks for a convention, a visit, the Memorial. */
export const SOON_DAYS = 60;

export interface HomeDigest {
  /** The person's next own row, or null when there is none at all. */
  next: TimelineEntry | null;
  /** True when `next` lies beyond the two weeks the list shows. */
  nextIsFar: boolean;
  /** The own row after `next`, for the line «Следующее — …». */
  following: TimelineEntry | null;
  /** The away-period `next` falls into, if it does. */
  awayDuring: Absence | null;
  /** Own rows beyond the list, not counting `next` and `following`. */
  moreCount: number;
  /** Date of the last of them. */
  moreUntil: string | null;
  /** Conventions, visits and the Memorial after the list and within SOON_DAYS. */
  soon: SpecialEvent[];
}

/** Is this row the signed-in person's own? */
export function isOwnEntry(en: TimelineEntry): boolean {
  switch (en.type) {
    case 'meeting':
      return en.myParts.length > 0 || en.weeklyCleaning;
    case 'task':
    case 'outgoing_talk':
    case 'co_visit':
      return true;
    default:
      return false;
  }
}

/** The hour a row starts at, or null when it has none. */
export function entryTime(en: TimelineEntry): string | null {
  switch (en.type) {
    case 'meeting':
      return en.time || null;
    case 'task': {
      const it = en.task.item;
      // The weekly cleaning carries its hour in the planned instant.
      if (it.kind === 'cleaning' && it.thoroughPlannedAt) {
        const d = new Date(it.thoroughPlannedAt);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return it.time ?? en.task.meetingTime ?? null;
    }
    case 'outgoing_talk':
      return en.task.item.time ?? null;
    case 'co_visit':
      return en.item.startTime ?? null;
    case 'elders_meeting':
      return en.time;
    case 'event':
      return en.event.time ?? null;
    default:
      return null;
  }
}

function minutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Over already: today, with an hour, and that hour plus a meeting is past. */
export function isOver(en: TimelineEntry, todayISO: string, nowHM: string): boolean {
  if (en.dateISO !== todayISO) return en.dateISO < todayISO;
  const t = entryTime(en);
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return false;
  return minutes(t) + MEETING_LENGTH_MIN < minutes(nowHM);
}

const flat = (groups: DayGroup[]) => groups.flatMap((g) => g.entries);

export function digestHome(input: {
  timeline: Timeline;
  todayISO: string;
  nowHM: string;
  absences: Absence[];
  events: SpecialEvent[];
  nearDays: number;
}): HomeDigest {
  const { timeline, todayISO, nowHM, absences, events, nearDays } = input;
  const near = flat(timeline.near).filter(isOwnEntry);
  const far = flat(timeline.far).filter(isOwnEntry);
  const own = [...near, ...far].filter((en) => !isOver(en, todayISO, nowHM));

  const next = own[0] ?? null;
  const following = own[1] ?? null;
  const shown = new Set([next, following].filter(Boolean));
  const more = far.filter((en) => !shown.has(en));

  const awayDuring = next
    ? (absences.find(
        (a) =>
          a.startDate <= next.dateISO &&
          (a.endDate ?? a.startDate) >= next.dateISO &&
          // A talk elsewhere already explains its own trip.
          !(next.type === 'outgoing_talk' && next.absence?.id === a.id),
      ) ?? null)
    : null;

  const nearEnd = formatDateISO(addDays(new Date(`${todayISO}T00:00:00`), nearDays));
  const soonEnd = formatDateISO(addDays(new Date(`${todayISO}T00:00:00`), SOON_DAYS));
  const soon = events
    .filter(
      (e) =>
        (e.type === 'circuit_overseer_visit' || e.type === 'memorial' || isCongressEvent(e)) &&
        e.date > nearEnd &&
        e.date <= soonEnd,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    next,
    nextIsFar: !!next && !near.includes(next),
    following,
    awayDuring,
    moreCount: more.length,
    moreUntil: more.length ? more[more.length - 1].dateISO : null,
    soon,
  };
}
