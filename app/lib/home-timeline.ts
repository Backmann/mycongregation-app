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
  MyCoVisit,
  MyCoVisitItem,
  CoVisitFieldServiceWeek,
} from './api';
import { effectiveVersionFor } from './meeting-schedule';
import { addDays, formatDateISO, startOfWeekMonday } from './dates';
import { isCongressEvent, weekRules } from './week-rules';
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
  /** My service group cleans the hall after this meeting. */
  weeklyCleaning: boolean;
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

/**
 * A talk given in another congregation. The trip, the absence it causes and
 * the home meeting being missed are ONE fact, so they are one row: the absence
 * is folded in here and the home congregation's meeting that day is dropped.
 */
export interface OutgoingTalkEntry {
  type: 'outgoing_talk';
  key: string;
  dateISO: string;
  task: RefinedTask;
  /** The away-period this trip explains, if one covers the day. */
  absence: Absence | null;
}

/** «Тебя нет» — an away-period of the signed-in person, quiet context. */
export interface AbsenceEntry {
  type: 'absence';
  key: string;
  dateISO: string;
  absence: Absence;
}

/**
 * The circuit-overseer visit — a whole special week, shown as a distinctive
 * banner at its first day in the window rather than a generic event row.
 */
export interface VisitEntry {
  type: 'visit';
  key: string;
  dateISO: string;
  event: SpecialEvent;
}

/** One of my own items during a CO visit (hospitality, service with the CO…). */
export interface CoVisitItemEntry {
  type: 'co_visit';
  key: string;
  dateISO: string;
  item: MyCoVisitItem;
}

export type TimelineEntry =
  | MeetingEntry
  | EventEntry
  | TaskEntry
  | AbsenceEntry
  | VisitEntry
  | CoVisitItemEntry
  | OutgoingTalkEntry;

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
  /** My CO-visit items dated beyond the near window. */
  farCoVisit: MyCoVisitItem[];
}

export interface BuildTimelineInput {
  versions: MeetingSettingsVersion[];
  fieldServiceMeetings: FieldServiceMeeting[];
  publishersById: Map<string, Publisher>;
  events: SpecialEvent[];
  /** The signed-in person's own away-periods. */
  absences: Absence[];
  /** The signed-in person's own CO-visit items (and their visits). */
  coVisits?: MyCoVisit[];
  /** Field-service meetings planned inside a visit — background, for everyone. */
  coFieldService?: CoVisitFieldServiceWeek[];
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

/**
 * Where a task sits in the stream. The weekly cleaning is the exception: once
 * the group has picked a day and time it belongs on THAT day, not on the
 * Monday of its week, which read as "Monday is the cleaning day". Exported so
 * the collapsed «Дальше» zone groups items by exactly the same date.
 */
export function taskPlacementDate(r: RefinedTask, todayISO: string): string {
  return r.item.kind === 'cleaning' &&
    r.item.label === 'thorough' &&
    r.item.thoroughPlannedAt
    ? String(r.item.thoroughPlannedAt).slice(0, 10)
    : placementDate(r, todayISO);
}

export function buildTimeline(input: BuildTimelineInput): Timeline {
  const {
    versions,
    fieldServiceMeetings,
    publishersById,
    events,
    absences = [],
    coVisits = [],
    coFieldService = [],
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

  // ---- My own items, resolved up front: the meetings loop needs to know
  // which days I am away giving a talk and which weeks my group cleans ----
  // Cleaning happens after the meetings, so a convention week has none. Field
  // service (cart) stays: it can still happen that week.
  const droppedByCongress = (r: RefinedTask): boolean => {
    if (r.item.kind !== 'cleaning') return false;
    const monISO = formatDateISO(
      startOfWeekMonday(new Date(`${placementDate(r, todayISO)}T00:00:00`)),
    );
    const v = effectiveVersionFor(versions, monISO);
    return !!weekRules({ weekStartISO: monISO, version: v, events }).congress;
  };
  const refined = refineMyTasks(myItems, versions, todayISO).filter(
    (r) => !droppedByCongress(r),
  );

  const taskPlacement = (r: RefinedTask): string =>
    taskPlacementDate(r, todayISO);

  const outgoingTalkDates = new Set(
    refined
      .filter((r) => r.item.kind === 'outgoing_talk')
      .map((r) => taskPlacement(r)),
  );
  // Weeks where my group cleans after the meetings — shown inside the meeting
  // rows rather than as a day of its own.
  const cleanAfterMeetingWeeks = new Set(
    refined
      .filter(
        (r) => r.item.kind === 'cleaning' && r.item.label === 'after_meeting',
      )
      .map(
        (r) =>
          r.item.weekStartDate ??
          formatDateISO(
            startOfWeekMonday(new Date(`${taskPlacement(r)}T00:00:00`)),
          ),
      ),
  );

  // ---- Regular meetings (midweek / weekend), per the week's rules ----
  // Weeks with a convention hold no congregation meetings at all — the rules
  // module is the single authority, shared with the schedule screen.
  for (const weekISO of weekMondays) {
    const v = effectiveVersionFor(versions, weekISO);
    const rules = weekRules({ weekStartISO: weekISO, version: v, events });
    if (rules.congress) continue;
    if (!v) continue;
    for (const kind of ['midweek', 'weekend'] as const) {
      const dow = rules.dowOf(kind);
      const time = kind === 'midweek' ? v.midweekTime : v.weekendTime;
      if (!dow) continue;
      const dateISO = rules.dateOf(kind);
      if (!dateISO || !inNear(dateISO)) continue;
      // He is giving a talk elsewhere that day — showing the meeting he will
      // not attend was the confusing part.
      if (outgoingTalkDates.has(dateISO)) continue;

      const replacedBy = rules.replacedBy(kind) ?? null;
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
        weeklyCleaning: cleanAfterMeetingWeeks.has(weekISO),
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
      weeklyCleaning: false,
    });
  }

  // ---- Field-service meetings planned inside a circuit-overseer visit ----
  // During a visit that week's field service is planned in the visit
  // schedule, not the regular section, so without these the week looked
  // empty. They are ordinary background rows like any other field service.
  // One that is also MY own item is left to the personal row below, so the
  // same meeting is never stated twice.
  const myCoVisitItemIds = new Set(
    coVisits.flatMap((v) => v.items).map((it) => it.id),
  );
  for (const week of coFieldService) {
    for (const m of week.meetings) {
      if (myCoVisitItemIds.has(m.id)) continue;
      if (!inNear(m.itemDate)) continue;
      entries.push({
        type: 'meeting',
        key: `covfs-${m.id}`,
        dateISO: m.itemDate,
        time: m.startTime ?? '',
        kind: 'field_service',
        address: m.place,
        conductorName: m.conductorName,
        unassignedConductor: !m.conductorName,
        topic: null,
        sourceUrl: null,
        replacedBy: null,
        myParts: [],
        weeklyCleaning: false,
      });
    }
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
    // A circuit-overseer visit and a convention are whole special WEEKS, not
    // points in time: each gets a banner carrying its full range, placed on
    // the first day of the range. A convention used to be folded into the
    // weekend meeting's slot, which collapsed Fri–Sun onto the Sunday.
    if (e.type === 'circuit_overseer_visit' || isCongressEvent(e)) {
      entries.push({ type: 'visit', key: `visit-${e.id}`, dateISO: placed, event: e });
    } else {
      entries.push({ type: 'event', key: `ev-${e.id}`, dateISO: placed, event: e });
    }
  }

  // ---- My own non-meeting tasks (cleaning, cart, outgoing talk, co-lunch) ----
  const consumedAbsenceIds = new Set<string>();
  for (const r of refined) {
    if (!OWN_ROW_TASK_KINDS.has(r.item.kind)) continue;
    // The cleaning done after the meetings is spoken inside the meeting rows.
    if (r.item.kind === 'cleaning' && r.item.label === 'after_meeting') continue;
    const dateISO = taskPlacement(r);
    if (!inNear(dateISO)) continue;

    if (r.item.kind === 'outgoing_talk') {
      // Fold in the away-period this trip explains, so the day carries one row
      // instead of «тебя нет» plus a talk plus a meeting he will not attend.
      const away =
        absences.find(
          (a) =>
            a.startDate <= dateISO && (a.endDate ?? a.startDate) >= dateISO,
        ) ?? null;
      if (away) consumedAbsenceIds.add(away.id);
      entries.push({
        type: 'outgoing_talk',
        key: `talk-${dateISO}-${r.item.partKey ?? r.item.label}`,
        dateISO,
        task: r,
        absence: away,
      });
      continue;
    }

    entries.push({
      type: 'task',
      key: `task-${r.item.kind}-${dateISO}-${r.item.partKey ?? r.item.label}`,
      dateISO,
      task: r,
    });
  }

  // ---- My away-periods (quiet context, "тебя нет") ----
  for (const a of absences) {
    if (consumedAbsenceIds.has(a.id)) continue; // spoken by the talk row
    const end = a.endDate ?? a.startDate;
    if (end < todayISO) continue; // already over
    if (a.startDate > nearEndISO) continue; // future ones go to farAbsences
    // Place on the first covered day within the window.
    const placed = a.startDate < todayISO ? todayISO : a.startDate;
    entries.push({ type: 'absence', key: `abs-${a.id}`, dateISO: placed, absence: a });
  }

  // ---- My own CO-visit items (personal, breathing) ----
  const coVisitItems: MyCoVisitItem[] = coVisits.flatMap((v) => v.items);
  for (const it of coVisitItems) {
    if (!inNear(it.itemDate)) continue;
    entries.push({
      type: 'co_visit',
      key: `cov-${it.id}`,
      dateISO: it.itemDate,
      item: it,
    });
  }

  // ---- Group the near window by day, ordered by date then time ----
  // The visit banner and absences carry no time and read as all-day context,
  // so they sort to the top of their day, ahead of timed rows.
  const timeOf = (en: TimelineEntry): string =>
    en.type === 'meeting'
      ? en.time
      : en.type === 'event'
        ? en.event.time ?? '00:00'
        : en.type === 'absence' || en.type === 'visit'
          ? '00:00'
          : en.type === 'co_visit'
            ? en.item.startTime ?? '99:99'
            : en.type === 'outgoing_talk'
              ? en.task.item.time ?? '99:99'
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
    const iso = taskPlacement(r);
    return iso > nearEndISO && iso <= farEndISO;
  });

  // ---- Far away-periods: any future absence starting beyond the window ----
  const farAbsences = absences
    .filter((a) => !consumedAbsenceIds.has(a.id) && a.startDate > nearEndISO)
    .sort((x, y) => x.startDate.localeCompare(y.startDate));

  // ---- Far CO-visit items: my items dated beyond the near window ----
  const farCoVisit = coVisitItems
    .filter((it) => it.itemDate > nearEndISO)
    .sort((x, y) => x.itemDate.localeCompare(y.itemDate));

  return { near, far, farAbsences, farCoVisit };
}
