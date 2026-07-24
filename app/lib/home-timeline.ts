/**
 * Единая хронологическая лента главного экрана.
 *
 * Сегодня одно и то же время описано пятью блоками (мои задания, визит РН,
 * встречи, события, отсутствия) — чтобы представить свою неделю, человек читает
 * пять списков и складывает в уме. Ядро ленты сливает ТРИ из них — задания,
 * встречи и события — в один поток по времени. Личное тянет на себя, фон идёт
 * тихо. Отсутствия и визит РН пока живут отдельными блоками (вводятся слоями).
 *
 * Две зоны:
 *   • «ближайшее» — следующие 14 дней, всё вперемешку, сгруппировано по дням;
 *   • «дальше» — только мои задания до 8 недель, свёрнуто (доклад через три
 *     недели — новость; встреча через три недели — нет).
 *
 * Дедупликация здесь честнее, чем в старых блоках: пункты встречи и обязанности
 * показываются ВНУТРИ строки встречи (а не второй раз отдельным заданием);
 * конгресс, отменяющий встречу, — один раз (как отменённая встреча), а не и
 * встречей, и событием.
 */
import {
  FieldServiceMeeting,
  MeetingSettingsVersion,
  MyAssignmentItem,
  Publisher,
  SpecialEvent,
  Absence,
} from './api';
import { effectiveVersionFor } from './meeting-schedule';
import { addDays, formatDateISO, startOfWeekMonday } from './dates';
import { refineMyTasks, RefinedTask } from './my-tasks';

export type MeetingKind = 'midweek' | 'weekend' | 'field_service';

/** One nested "this part is yours" line inside a meeting row. */
export interface MyPartLine {
  section: string | null;
  title: string;
}

/** A meeting (midweek/weekend/field service) — background unless it is mine. */
export interface MeetingEntry {
  type: 'meeting';
  key: string;
  dateISO: string;
  time: string;
  kind: MeetingKind;
  address: string | null;
  conductorName: string | null;
  unassignedConductor: boolean;
  topic: string | null;
  sourceUrl: string | null;
  /** When a convention/assembly cancels this meeting, the event that did it. */
  replacedBy: SpecialEvent | null;
  /** My parts/duties in this meeting; non-empty ⇒ the row is mine. */
  myParts: MyPartLine[];
}

/** A special event shown as background (never one that replaced a meeting). */
export interface EventEntry {
  type: 'event';
  key: string;
  dateISO: string;
  event: SpecialEvent;
}

/** A personal assignment that is NOT a meeting part (cleaning, cart, …). */
export interface TaskEntry {
  type: 'task';
  key: string;
  dateISO: string;
  task: RefinedTask;
}

/** «Тебя нет» — an away-period of the signed-in person, quiet context. */
export interface AbsenceEntry {
  type: 'absence';
  key: string;
  dateISO: string;
  absence: Absence;
}

export type TimelineEntry = MeetingEntry | EventEntry | TaskEntry | AbsenceEntry;

export interface DayGroup {
  dateISO: string;
  entries: TimelineEntry[];
}

export interface Timeline {
  /** Next `nearDays` days, everything mixed, grouped by day. */
  near: DayGroup[];
  /** My own assignments beyond the near window, up to `farDays`, flat. */
  far: RefinedTask[];
  /** My away-periods starting beyond the near window (any future date). */
  farAbsences: Absence[];
}

export interface BuildTimelineInput {
  versions: MeetingSettingsVersion[];
  fieldServiceMeetings: FieldServiceMeeting[];
  publishersById: Map<string, Publisher>;
  events: SpecialEvent[];
  /** The signed-in person's own away-periods. */
  absences: Absence[];
  myItems: MyAssignmentItem[];
  todayISO: string;
  /** Text for a field-service meeting the signed-in person conducts. */
  youConductLabel: string;
  /**
   * Resolves one of my meeting parts/duties to its display title and section
   * heading. Supplied by the caller (which has i18n) so this builder stays
   * free of translation concerns.
   */
  resolvePart: (item: MyAssignmentItem) => MyPartLine;
  nearDays?: number;
  farDays?: number;
}

/** Meeting/duty tasks are shown inside their meeting row, not as own rows. */
const NESTED_IN_MEETING = new Set<MyAssignmentItem['kind']>([
  'meeting',
  'duty',
]);
/** A field-service day I conduct is shown inside its field-service row. */
const OWN_ROW_TASK_KINDS = new Set<MyAssignmentItem['kind']>([
  'cleaning',
  'cart',
  'outgoing_talk',
  'co_lunch',
]);

/**
 * Placement date for windowing/grouping. A week-scoped task (weekOnly) belongs
 * to its whole week: if that week is current, it sits under "today" so a still-
 * relevant weekly chore is not pushed before the visible window; a future week
 * sits under its Monday.
 */
export function placementDate(r: RefinedTask, todayISO: string): string {
  return r.weekOnly && r.dateISO < todayISO ? todayISO : r.dateISO;
}

/** Does a special event's date range touch a given day? */
function eventCoversDay(e: SpecialEvent, dayISO: string): boolean {
  const end = e.endDate ?? e.date;
  return e.date <= dayISO && dayISO <= end;
}

export function buildTimeline(input: BuildTimelineInput): Timeline {
  const {
    versions,
    fieldServiceMeetings,
    publishersById,
    events,
    absences = [],
    myItems,
    todayISO,
    youConductLabel,
    resolvePart,
    nearDays = 14,
    farDays = 56,
  } = input;

  const nearEndISO = formatDateISO(
    addDays(new Date(`${todayISO}T00:00:00`), nearDays),
  );
  const farEndISO = formatDateISO(
    addDays(new Date(`${todayISO}T00:00:00`), farDays),
  );

  const inNear = (iso: string) => iso >= todayISO && iso <= nearEndISO;

  // The Mondays whose weeks the near window touches — meeting settings and
  // field-service meetings are keyed by week start.
  const weekMondays: string[] = [];
  {
    let cursor = startOfWeekMonday(new Date(`${todayISO}T00:00:00`));
    const guard = nearDays / 7 + 2;
    for (let i = 0; i < guard; i++) {
      const iso = formatDateISO(cursor);
      weekMondays.push(iso);
      if (iso > nearEndISO) break;
      cursor = addDays(cursor, 7);
    }
  }

  const entries: TimelineEntry[] = [];
  // Events already shown as a meeting's replacement are not repeated as their
  // own background row.
  const replacedEventIds = new Set<string>();

  // ---- Regular meetings (midweek / weekend) from the effective settings ----
  for (const weekISO of weekMondays) {
    const v = effectiveVersionFor(versions, weekISO);
    if (!v) continue;
    for (const kind of ['midweek', 'weekend'] as const) {
      const dow = kind === 'midweek' ? v.midweekDow : v.weekendDow;
      const time = kind === 'midweek' ? v.midweekTime : v.weekendTime;
      if (!dow) continue;
      const dateISO = formatDateISO(
        addDays(new Date(`${weekISO}T00:00:00`), dow - 1),
      );
      if (!inNear(dateISO)) continue;

      const replacedBy =
        events.find((e) => {
          const isCongress =
            e.type === 'regional_convention' || e.type === 'circuit_assembly';
          if (!e.replacesMeeting && !isCongress) return false;
          const end = e.endDate ?? e.date;
          if (kind === 'weekend') {
            const base = new Date(`${weekISO}T00:00:00`);
            const sat = formatDateISO(addDays(base, 5));
            const sun = formatDateISO(addDays(base, 6));
            return e.date <= sun && sat <= end;
          }
          return e.date <= dateISO && dateISO <= end;
        }) ?? null;
      if (replacedBy) replacedEventIds.add(replacedBy.id);

      const myParts: MyPartLine[] = myItems
        .filter(
          (it) =>
            (it.kind === 'meeting' || it.kind === 'duty') &&
            it.weekStartDate === weekISO &&
            it.eventType === kind,
        )
        .sort((a, b) => (a.partOrder ?? 999) - (b.partOrder ?? 999))
        .map((it) => resolvePart(it));

      entries.push({
        type: 'meeting',
        key: `${kind}-${dateISO}`,
        dateISO,
        time,
        kind,
        address: v.address,
        conductorName: null,
        unassignedConductor: false,
        topic: null,
        sourceUrl: null,
        replacedBy,
        myParts,
      });
    }
  }

  // ---- Field-service meetings ----
  for (const m of fieldServiceMeetings) {
    const dateISO = formatDateISO(
      addDays(new Date(`${m.weekStartDate}T00:00:00`), m.dayOfWeek - 1),
    );
    if (!inNear(dateISO)) continue;
    const conductor = m.conductorPublisherId
      ? publishersById.get(m.conductorPublisherId) ?? null
      : null;
    const iConduct = myItems.some(
      (it) =>
        it.kind === 'field_service' &&
        it.weekStartDate === m.weekStartDate &&
        it.dayOfWeek === m.dayOfWeek &&
        (!it.time || it.time === m.startTime),
    );
    entries.push({
      type: 'meeting',
      key: `fs-${m.id}`,
      dateISO,
      time: m.startTime,
      kind: 'field_service',
      address: m.address,
      conductorName: conductor ? conductor.displayName : null,
      unassignedConductor: !conductor,
      topic: m.topic,
      sourceUrl: m.sourceUrl,
      replacedBy: null,
      myParts: iConduct ? [{ section: null, title: youConductLabel }] : [],
    });
  }

  // ---- Background events (not the ones that replaced a meeting) ----
  for (const e of events) {
    if (replacedEventIds.has(e.id)) continue;
    // Place the event on the first day of its range that falls in the window.
    let placed: string | null = null;
    for (let i = 0; i <= nearDays; i++) {
      const dayISO = formatDateISO(
        addDays(new Date(`${todayISO}T00:00:00`), i),
      );
      if (eventCoversDay(e, dayISO)) {
        placed = dayISO;
        break;
      }
    }
    if (!placed) continue;
    entries.push({ type: 'event', key: `ev-${e.id}`, dateISO: placed, event: e });
  }

  // ---- My own non-meeting tasks (cleaning, cart, outgoing talk, co-lunch) ----
  const refined = refineMyTasks(myItems, versions, todayISO);
  for (const r of refined) {
    if (!OWN_ROW_TASK_KINDS.has(r.item.kind)) continue;
    const dateISO = placementDate(r, todayISO);
    if (!inNear(dateISO)) continue;
    entries.push({
      type: 'task',
      key: `task-${r.item.kind}-${dateISO}-${r.item.partKey ?? r.item.label}`,
      dateISO,
      task: r,
    });
  }

  // ---- My away-periods (quiet context, "тебя нет") ----
  for (const a of absences) {
    const end = a.endDate ?? a.startDate;
    if (end < todayISO) continue; // already over
    if (a.startDate > nearEndISO) continue; // future ones go to farAbsences
    // Place on the first covered day within the window.
    const placed = a.startDate < todayISO ? todayISO : a.startDate;
    entries.push({ type: 'absence', key: `abs-${a.id}`, dateISO: placed, absence: a });
  }

  // ---- Group the near window by day, ordered by date then time ----
  // Absences carry no time and read as all-day context, so they sort to the
  // top of their day, ahead of timed rows.
  const timeOf = (en: TimelineEntry): string =>
    en.type === 'meeting'
      ? en.time
      : en.type === 'event'
        ? en.event.time ?? '00:00'
        : en.type === 'absence'
          ? '00:00'
          : en.task.item.time ?? en.task.meetingTime ?? '99:99';

  entries.sort(
    (a, b) => a.dateISO.localeCompare(b.dateISO) || timeOf(a).localeCompare(timeOf(b)),
  );

  const near: DayGroup[] = [];
  for (const en of entries) {
    const last = near[near.length - 1];
    if (last && last.dateISO === en.dateISO) last.entries.push(en);
    else near.push({ dateISO: en.dateISO, entries: [en] });
  }

  // ---- Far zone: my own assignments beyond the near window ----
  const far = refined.filter((r) => {
    const iso = placementDate(r, todayISO);
    return iso > nearEndISO && iso <= farEndISO;
  });

  // ---- Far away-periods: any future absence starting beyond the window ----
  const farAbsences = absences
    .filter((a) => a.startDate > nearEndISO)
    .sort((x, y) => x.startDate.localeCompare(y.startDate));

  return { near, far, farAbsences };
}
