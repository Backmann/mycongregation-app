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
 *  3. Событие с replacesMeeting, НАКРЫВАЮЩЕЕ ДЕНЬ встречи, встаёт на её место.
 *     Именно накрывающее день, а не «выходные вообще»: особая речь в субботу —
 *     событие субботы, и воскресную встречу она не заменяет. Сервер судит этот
 *     флаг ровно так же — common/week-rules.ts, правило 4.
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
  /** The event standing in for a meeting, if one covers its day. */
  replacedBy: (kind: MeetingKind) => SpecialEvent | undefined;
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

  const replacedBy = (kind: MeetingKind): SpecialEvent | undefined => {
    if (!version) return undefined;
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

  return {
    weekStartISO,
    coVisit,
    congress,
    meetingsHeld: !congress,
    dowOf,
    dateOf,
    replacedBy,
  };
}
