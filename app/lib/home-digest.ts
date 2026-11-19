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
import { inviteesOf } from './invitations';

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

/** A task for a whole week — no day of its own (a cleaning not yet planned). */
export function isWeekChore(en: TimelineEntry): boolean {
  return en.type === 'task' && !!en.task.weekOnly && !entryTime(en);
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
  const own = [...near, ...far].filter(
    (en) =>
      !isOver(en, todayISO, nowHM) &&
      // A meeting called off is not what comes next (13 October 2026).
      !(en.type === 'meeting' && en.cancelled) &&
      // Nor a chore for the whole week with no day of its own: it sat on
      // «today» every day of the week and pushed the real next thing out of
      // the card (review, 18 November 2026). It stays in the list.
      !isWeekChore(en),
  );

  const next = own[0] ?? null;
  const following = own[1] ?? null;
  const shown = new Set([next, following].filter(Boolean));
  const more = far.filter((en) => !shown.has(en));

  const awayDuring = next
    ? (absences.find(
        (a) =>
          a.startDate <= next.dateISO &&
          (a.endDate ?? a.startDate) >= next.dateISO &&
          // Away on the day of a talk elsewhere is no news: the trip IS the
          // absence, however many records describe it (22 October 2026).
          next.type !== 'outgoing_talk',
      ) ?? null)
    : null;

  const nearEnd = formatDateISO(addDays(new Date(`${todayISO}T00:00:00`), nearDays));
  const soonEnd = formatDateISO(addDays(new Date(`${todayISO}T00:00:00`), SOON_DAYS));
  const soon = events
    .filter(
      (e) =>
        // An event for the invited is an invitation to the person himself
        // (10 November 2026): it stands here from the day it is entered,
        // not only in the last two months — a school is planned for.
        ((e.type === 'circuit_overseer_visit' || e.type === 'memorial' || isCongressEvent(e)) &&
          e.date > nearEnd &&
          e.date <= soonEnd) ||
        (!!inviteesOf(e.type) && e.date > nearEnd),
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

/**
 * Home's two lists after the card (9 November 2026, variant Б):
 *  - «Встречи собрания»: the two weeks' meetings and the congregation's
 *    events, without the person's rows of other kinds;
 *  - «Дальше у вас»: those rows of his — a cart shift, a lunch, a talk
 *    elsewhere, an absence — then everything of his beyond the two weeks,
 *    never the card's own row;
 *
 * What is different about a meeting — another place, a moved day, called
 * off, a changed programme — was a third list, «Важно». Since 10 November
 * 2026 the row of that meeting says it, in the strip every notice wears.
 */
export interface HomeSplit {
  meetings: DayGroup[];
  ahead: TimelineEntry[];
}


export function splitHome(timeline: Timeline, nextKey: string | null): HomeSplit {
  // Variant A (draft, 19 November 2026): the two weeks are ONE list, the
  // person's own rows in their own day; «Дальше у вас» is only what lies
  // beyond them.
  const meetings = timeline.near.filter((g) => g.entries.length > 0);
  const ahead = flat(timeline.far)
    .filter(isOwnEntry)
    .filter((en) => en.key !== nextKey);
  return { meetings, ahead };
}

/**
 * A meeting row with nothing different about it (no move, no notice, no
 * visit, not replaced, not the Memorial, not cancelled) and — unless
 * `allowOwn` — nothing of the person's own: it can be said in one line, its
 * name and its hour.
 */
export function isPlainMeeting(en: TimelineEntry, allowOwn = false): boolean {
  return (
    en.type === 'meeting' &&
    // Nothing of his — and, belt to the braces, no agenda id a change mark
    // could stand on (Home marks changes seen once shown).
    (allowOwn || (!isOwnEntry(en) && !(en.agendaIds?.length))) &&
    !en.cancelled &&
    !en.movedFrom &&
    !en.movedTo &&
    !en.replacedBy &&
    !en.memorial &&
    !en.notice &&
    !en.fieldNote &&
    !en.serviceOverseerVisit &&
    !en.occasion &&
    !en.specialTalk &&
    !en.meetingChanged
  );
}

/**
 * Is a day of the two weeks said in one line per meeting (variant A)? Only
 * when every row is a plain meeting, and the only row of his own is the one
 * on the «Ваше ближайшее» card — which says it whole, with its change marks.
 * A row of his that is not on the card never goes into one line: Home marks
 * changes seen once shown, and a mark not drawn would be lost.
 */
export function isSlimDay(g: DayGroup, nextKey: string | null): boolean {
  return (
    g.entries.length > 0 &&
    // Several field-service meetings on one day are said in full, as usual
    // (Lionel, 19 November 2026): which to go to is the point of the day.
    g.entries.filter((en) => en.type === 'meeting' && en.kind === 'field_service').length <= 1 &&
    g.entries.every(
      (en) => isPlainMeeting(en) || (en.key === nextKey && isPlainMeeting(en, true)),
    )
  );
}

export interface ListSegment {
  /** The away-periods covering these days; empty — not away. */
  away: Absence[];
  groups: DayGroup[];
}

/**
 * The two weeks cut where being away begins and ends (variant A). A day is
 * away when any of the person's away-periods covers it; its away-period rows
 * become the band's head, and plain field service is left out of it — he is
 * not there. Nothing of his own is ever left out. A day left empty stays as
 * an empty group, so a band with no meetings still shows.
 */
export function awaySegments(groups: DayGroup[]): ListSegment[] {
  const seen = new Set<string>();
  const periods: Absence[] = [];
  for (const g of groups)
    for (const en of g.entries)
      if (en.type === 'absence' && !seen.has(en.absence.id)) {
        seen.add(en.absence.id);
        periods.push(en.absence);
      }
  const covering = (d: string) =>
    periods.filter((a) => a.startDate <= d && d <= (a.endDate ?? a.startDate));
  const out: ListSegment[] = [];
  let curKey: string | null = null;
  for (const g of groups) {
    const away = covering(g.dateISO);
    const key = away.map((a) => a.id).join('|');
    const entries = g.entries.filter(
      (en) =>
        en.type !== 'absence' &&
        !(
          away.length > 0 &&
          en.type === 'meeting' &&
          en.kind === 'field_service' &&
          isPlainMeeting(en)
        ),
    );
    if (key !== curKey) {
      out.push({ away, groups: [] });
      curKey = key;
    }
    out[out.length - 1].groups.push({ ...g, entries });
  }
  return out.filter((sg) => sg.away.length > 0 || sg.groups.some((g) => g.entries.length > 0));
}

