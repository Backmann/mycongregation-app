/**
 * Что на самом деле происходит на этой неделе.
 *
 * Правила недели раньше жили внутри экрана «Расписание», а лента на главной
 * вычисляла встречи сама — и знала только часть из них. Поэтому на главной
 * оставались встречи на неделе конгресса и не переезжала встреча в будний день
 * во время визита районного. Теперь свод один, и спрашивают его оба экрана.
 *
 * Правила, по порядку важности:
 *  1. Конгресс или областной конгресс на неделе ⇒ собрание не встречается
 *     вовсе: ни в будний день, ни в выходной, и обязанности с уборкой тоже
 *     снимаются. Встречи для проповеди при этом остаются — они могут быть.
 *  2. Визит районного надзирателя ⇒ встреча в будний день переезжает; день
 *     хранится на самом событии (coMidweekDow, по умолчанию вторник).
 *  3. Вечеря ⇒ уступает ОДНА встреча, по РОДУ ДНЯ: в будний день уступает
 *     будняя, в выходной — выходная. Не «встреча того же дня»: Вечеря во
 *     вторник при встрече в четверг уносит именно четверговую.
 *  4. Событие с replacesMeeting, НАКРЫВАЮЩЕЕ ДЕНЬ встречи, встаёт на её место.
 *     Именно накрывающее день, а не «выходные вообще»: особая речь в субботу —
 *     событие субботы, и воскресную встречу она не заменяет.
 *
 * Правила 1–4 — то же самое и в том же порядке, что на сервере
 * (common/week-rules.ts). События заводятся в одном разделе, все виды подряд,
 * поэтому и разбирать их обе стороны должны одинаково.
 *
 * Модуль чистый: ни i18n, ни React, ни запросов — только даты и правила.
 */
import { MeetingSettingsVersion, SpecialEvent } from './api';
import { addDays, formatDateISO } from './dates';

export type MeetingKind = 'midweek' | 'weekend';

export interface WeekRules {
  /** Monday of the week these rules describe. */
  weekStartISO: string;
  /** The circuit-overseer visit covering this week, if any. */
  coVisit: SpecialEvent | null;
  /** A convention or circuit assembly this week — then no meetings are held. */
  congress: SpecialEvent | null;
  /** False during a convention week: the congregation does not meet at all. */
  meetingsHeld: boolean;
  /** Actual weekday of a meeting (1=Mon..7=Sun), the CO-visit shift included. */
  dowOf: (kind: MeetingKind) => number | undefined;
  /** Actual calendar date of a meeting, or null when it has no day. */
  dateOf: (kind: MeetingKind) => string | null;
  /** The Memorial falling inside this week, if any. */
  memorial: SpecialEvent | null;
  /** Which meeting the Memorial takes, or null when there is no Memorial. */
  memorialTakes: MeetingKind | null;
  /** The event standing in for a meeting, if one covers its day. */
  replacedBy: (kind: MeetingKind) => SpecialEvent | undefined;
  /** True when this meeting is not held at all — for any of the reasons. */
  isTakenAway: (kind: MeetingKind) => boolean;
}

/** A convention or a circuit assembly — both cancel the week's meetings. */
export function isCongressEvent(e: SpecialEvent): boolean {
  return e.type === 'regional_convention' || e.type === 'circuit_assembly';
}

/** The events touching a given week, from a longer list. */
export function eventsOfWeek(
  events: SpecialEvent[],
  weekStartISO: string,
): SpecialEvent[] {
  const nextWeekISO = formatDateISO(
    addDays(new Date(`${weekStartISO}T00:00:00`), 7),
  );
  return events.filter(
    (e) => e.date < nextWeekISO && (e.endDate ?? e.date) >= weekStartISO,
  );
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
function isoDowOf(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function weekRules(input: {
  weekStartISO: string;
  version: MeetingSettingsVersion | null | undefined;
  /** All known events; filtered to this week internally. */
  events: SpecialEvent[];
}): WeekRules {
  const { weekStartISO, version } = input;
  const weekStart = new Date(`${weekStartISO}T00:00:00`);
  const events = eventsOfWeek(input.events, weekStartISO);

  const coVisit =
    events.find((e) => e.type === 'circuit_overseer_visit') ?? null;
  const congress = events.find(isCongressEvent) ?? null;

  const dowOf = (kind: MeetingKind): number | undefined => {
    if (kind === 'weekend') return version?.weekendDow ?? undefined;
    // During a visit the midweek meeting commonly moves to Tuesday.
    if (coVisit) return coVisit.coMidweekDow ?? 2;
    return version?.midweekDow ?? undefined;
  };

  const dateOf = (kind: MeetingKind): string | null => {
    const dow = dowOf(kind);
    return dow ? formatDateISO(addDays(weekStart, dow - 1)) : null;
  };

  // The Memorial takes ONE meeting, chosen by the KIND OF DAY it falls on —
  // the same rule the server applies, word for word. It lives here because the
  // events screen enters every kind side by side, so both sides must read them
  // the same way.
  //
  // This was missing for a few hours today and it cost something real: the
  // flag rule below learned to leave the Memorial alone (correctly — it does
  // not go by the covered day), but nothing took its place, so a Memorial week
  // showed the meeting as ordinary while the server had already stopped
  // counting it.
  const weekEndISO = formatDateISO(addDays(weekStart, 6));
  const memorial =
    events.find(
      (e) =>
        e.type === 'memorial' && e.date >= weekStartISO && e.date <= weekEndISO,
    ) ?? null;
  const memorialTakes: MeetingKind | null = memorial
    ? isoDowOf(memorial.date) >= 6
      ? 'weekend'
      : 'midweek'
    : null;

  const replacedBy = (kind: MeetingKind): SpecialEvent | undefined => {
    if (!version) return undefined;
    // The Memorial stands in for the meeting it takes — the home timeline and
    // the schedule already draw whatever this returns IN PLACE OF the meeting,
    // which is exactly right for it. Only the choice of WHICH meeting differs:
    // by the kind of day, not by the day it covers, so it is answered above
    // and returned here.
    if (memorialTakes === kind) return memorial ?? undefined;
    const dateISO = dateOf(kind);
    if (!dateISO) return undefined;
    // BY THE COVERED DAY, for both kinds alike. The weekend used to be judged
    // by whether the event touched the Saturday-Sunday pair at all, which is
    // right for the Memorial and wrong for everything else: a special talk on
    // a Saturday is an event of that Saturday, not of "the weekend in
    // general", and it cannot stand in for a Sunday meeting.
    //
    // The Memorial is deliberately NOT handled here. It replaces a meeting by
    // the KIND OF DAY it falls on, and it is becoming a section of its own —
    // see [[mycongregation]]. Until then it simply is not one of these.
    return events.find((e) => {
      if (!e.replacesMeeting && !isCongressEvent(e)) return false;
      if (e.type === 'memorial') return false;
      const end = e.endDate ?? e.date;
      return e.date <= dateISO && end >= dateISO;
    });
  };

  // One question, one answer: "is this meeting held this week at all". Every
  // caller that skips a meeting should ask THIS rather than assemble its own
  // combination of congress + memorial + flag, which is how they drifted apart
  // in the first place.
  const isTakenAway = (kind: MeetingKind): boolean =>
    !!congress || !!replacedBy(kind);

  return {
    weekStartISO,
    coVisit,
    congress,
    memorial,
    memorialTakes,
    meetingsHeld: !congress,
    dowOf,
    dateOf,
    replacedBy,
    isTakenAway,
  };
}
