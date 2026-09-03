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
  /**
   * Field service: whose group, and whether the service overseer is coming.
   *
   * The home timeline is the THIRD place a field-service meeting is drawn —
   * after the meetings screen and the schedule — and it was the one still
   * silent about the visit. A visit shown in two places out of three reads as
   * a visit that did not save.
   */
  groupName?: string | null;
  serviceOverseerVisit?: boolean;
  sourceUrl: string | null;
  /** When a convention/assembly cancels this meeting, the event that did it. */
  replacedBy: SpecialEvent | null;
  /**
   * The Memorial, when it is THIS row's meeting — it takes one of the two and
   * stands in its place. Set here so the row can carry the evening's own day,
   * hour and address instead of the settings', and lead where its programme
   * is read.
   */
  memorial?: SpecialEvent | null;
  /** Monday of the row's week, for opening the schedule at it. */
  weekStartISO?: string;
  /** My parts/duties in this meeting; non-empty ⇒ the row is mine. */
  myParts: MyPartLine[];
  /** My service group cleans the hall after this meeting. */
  weeklyCleaning: boolean;
  /** A combined field-service meeting for the whole congregation. */
  isGeneral: boolean;
}

/** A special event shown as background (never one that replaced a meeting). */
/**
 * The body's own meeting, for the elders it concerns.
 *
 * Only once the agenda is APPROVED: before that it is still being put
 * together, and a date that may still move has no business taking room on
 * anybody's home screen. Only the day, the hour and the place travel here —
 * the questions live behind the sign-in, as they do in every notification.
 */
export interface EldersMeetingEntry {
  type: 'elders_meeting';
  key: string;
  dateISO: string;
  time: string | null;
  place: string | null;
}

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
  | EldersMeetingEntry
  | OutgoingTalkEntry;

export interface DayGroup {
  dateISO: string;
  entries: TimelineEntry[];
}

export interface Timeline {
  /** Next `nearDays` days, everything mixed, grouped by day. */
  near: DayGroup[];
  /**
   * Everything of MINE beyond that window, grouped by day exactly the same
   * way — same rows, same detail. There is no upper cut: a talk arranged
   * months ahead is precisely what this zone exists to show.
   */
  far: DayGroup[];
}

export interface BuildTimelineInput {
  versions: MeetingSettingsVersion[];
  fieldServiceMeetings: FieldServiceMeeting[];
  publishersById: Map<string, Publisher>;
  /** Service-group names, so a visit can say whose group it is. */
  groupNameById?: Map<string, string>;
  events: SpecialEvent[];
  /** Approved meetings of the body; empty for anybody who is not an elder. */
  eldersMeetings?: {
    id: string;
    date: string;
    startTime: string | null;
    placeText: string | null;
    approvedAt: string | null;
  }[];
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
  // A field-service meeting speaks inside its own background row — but that
  // row exists only for the three weeks the home screen loads. Beyond them a
  // meeting the person is recorded in fell between two rules: no background
  // row to speak inside, and no right to a row of its own. A visit planned for
  // September was invisible while its data was perfectly correct, which is
  // what made it look, four times over, like a saving fault.
  //
  // Within those three weeks the background row still speaks it, and the guard
  // below keeps the same meeting from being stated twice.
  'field_service',
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
    groupNameById,
    events,
    eldersMeetings = [],
    absences = [],
    coVisits = [],
    coFieldService = [],
    myItems,
    todayISO,
    youConductLabel,
    resolvePart,
    nearDays = 14,
  } = input;

  const nearEndISO = formatDateISO(
    addDays(new Date(`${todayISO}T00:00:00`), nearDays),
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
  const farEntries: TimelineEntry[] = [];
  /** Field-service meetings already drawn as background rows. */
  const spokenFieldService = new Set<string>();
  /**
   * Background (meetings, events) only ever belongs to the near window. My own
   * items go wherever their date falls — near if inside the window, otherwise
   * into the far zone, which has no far edge.
   */
  const pushMine = (en: TimelineEntry) => {
    if (en.dateISO < todayISO) return;
    (en.dateISO <= nearEndISO ? entries : farEntries).push(en);
  };
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
  // Events go in so a visit week places a part on the day the meeting was
  // actually moved to, rather than on the weekday the settings name.
  const refined = refineMyTasks(myItems, versions, todayISO, events).filter(
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
      if (!dow) continue;
      const settingsDateISO = rules.dateOf(kind);
      if (!settingsDateISO) continue;
      // The Memorial takes this meeting and is held on ITS OWN day, which the
      // settings know nothing about: the evening is fixed by the calendar, the
      // meeting by the congregation. Mixing the two put the Memorial's hour
      // and address on the weekday of a meeting that is not taking place.
      const memorial = rules.memorialTakes === kind ? rules.memorial : null;
      const dateISO = memorial ? memorial.date : settingsDateISO;
      const time = memorial
        ? (memorial.time ?? '')
        : kind === 'midweek'
          ? v.midweekTime
          : v.weekendTime;
      if (!inNear(dateISO)) continue;
      // He is giving a talk elsewhere that day — showing the meeting he will
      // not attend was the confusing part.
      if (outgoingTalkDates.has(dateISO)) continue;

      const replacedBy = rules.replacedBy(kind) ?? null;
      if (replacedBy) replacedEventIds.add(replacedBy.id);

      // On a Memorial week MY part is a part of the Memorial: gathering by
      // midweek/weekend only left the brother saying a prayer, and the brother
      // on the parking, with nothing on the home screen at all.
      const myEventType = memorial ? 'memorial' : kind;
      const myParts: MyPartLine[] = myItems
        .filter(
          (it) =>
            (it.kind === 'meeting' || it.kind === 'duty') &&
            it.weekStartDate === weekISO &&
            it.eventType === myEventType,
        )
        .sort((a, b) => (a.partOrder ?? 999) - (b.partOrder ?? 999))
        .map((it) => resolvePart(it));

      entries.push({
        type: 'meeting',
        key: `${kind}-${dateISO}`,
        dateISO,
        time,
        kind,
        address: memorial ? (memorial.address ?? v.address) : v.address,
        memorial,
        weekStartISO: weekISO,
        conductorName: null,
        unassignedConductor: false,
        topic: null,
        sourceUrl: null,
        replacedBy,
        myParts,
        weeklyCleaning: cleanAfterMeetingWeeks.has(weekISO),
        isGeneral: false,
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
    // Remembered so the personal loop below does not repeat what this row
    // already says.
    spokenFieldService.add(`${m.weekStartDate}|${m.dayOfWeek}`);
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
      groupName: m.serviceGroupId
        ? (groupNameById?.get(m.serviceGroupId) ?? null)
        : null,
      serviceOverseerVisit: !!m.serviceOverseerVisit,
      myParts: iConduct ? [{ section: null, title: youConductLabel }] : [],
      weeklyCleaning: false,
      isGeneral: !!m.isGeneral,
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
        // A visit item names the brother going out WITH the overseer, not a
        // conductor. Saying «Ведущий: …» there stated something untrue, and
        // «не назначен» would be just as wrong — so the line is left off.
        conductorName: null,
        unassignedConductor: false,
        topic: null,
        sourceUrl: null,
        replacedBy: null,
        myParts: [],
        weeklyCleaning: false,
        isGeneral: false,
      });
    }
  }

  // ---- Background events (not the ones that replaced a meeting) ----
  // The body's own meeting, and only once its agenda is settled.
  for (const m of eldersMeetings) {
    if (!m.approvedAt) continue;
    if (m.date < todayISO) continue;
    entries.push({
      type: 'elders_meeting',
      key: `em-${m.id}`,
      dateISO: m.date,
      time: m.startTime,
      place: m.placeText,
    });
  }

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
    // Said already by the meeting's own row — one thing, one line.
    if (
      r.item.kind === 'field_service' &&
      spokenFieldService.has(`${r.item.weekStartDate}|${r.item.dayOfWeek}`)
    ) {
      continue;
    }
    // The cleaning done after the meetings is spoken inside the meeting rows.
    if (r.item.kind === 'cleaning' && r.item.label === 'after_meeting') continue;
    const dateISO = taskPlacement(r);

    if (r.item.kind === 'outgoing_talk') {
      // Fold in the away-period this trip explains, so the day carries one row
      // instead of «тебя нет» plus a talk plus a meeting he will not attend.
      const away =
        absences.find(
          (a) =>
            a.startDate <= dateISO && (a.endDate ?? a.startDate) >= dateISO,
        ) ?? null;
      if (away) consumedAbsenceIds.add(away.id);
      pushMine({
        type: 'outgoing_talk',
        key: `talk-${dateISO}-${r.item.partKey ?? r.item.label}`,
        dateISO,
        task: r,
        absence: away,
      });
      continue;
    }

    pushMine({
      type: 'task',
      key: `task-${r.item.kind}-${dateISO}-${r.item.partKey ?? r.item.label}`,
      dateISO,
      task: r,
    });
  }

  // ---- My away-periods (quiet context, "тебя нет") ----
  /**
   * One row per away-period, however many records describe it.
   *
   * The pioneer school wrote an absence per DUTY, so a brother holding two on
   * the same evening had two records for one fact — and his home screen said
   * «Тебя нет» twice under the same date. The source now writes one; this is
   * the belt to that pair of braces, and it also covers a person who entered
   * the same days twice by hand.
   */
  const seenAway = new Set<string>();
  for (const a of absences) {
    if (consumedAbsenceIds.has(a.id)) continue; // spoken by the talk row
    const end = a.endDate ?? a.startDate;
    if (end < todayISO) continue; // already over
    const sameFact = `${a.startDate}|${end}|${a.note ?? ''}`;
    if (seenAway.has(sameFact)) continue;
    seenAway.add(sameFact);
    // An away-period already under way is pinned to today so it is not pushed
    // out of sight; a future one sits on its first day.
    const placed = a.startDate < todayISO ? todayISO : a.startDate;
    pushMine({ type: 'absence', key: `abs-${a.id}`, dateISO: placed, absence: a });
  }

  // ---- My own CO-visit items (personal, breathing) ----
  const coVisitItems: MyCoVisitItem[] = coVisits.flatMap((v) => v.items);
  for (const it of coVisitItems) {
    pushMine({
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
              : en.type === 'elders_meeting'
                ? en.time ?? '99:99'
                : en.task.item.time ?? en.task.meetingTime ?? '99:99';

  const byDay = (list: TimelineEntry[]): DayGroup[] => {
    list.sort(
      (a, b) =>
        a.dateISO.localeCompare(b.dateISO) ||
        timeOf(a).localeCompare(timeOf(b)),
    );
    const groups: DayGroup[] = [];
    for (const en of list) {
      const last = groups[groups.length - 1];
      if (last && last.dateISO === en.dateISO) last.entries.push(en);
      else groups.push({ dateISO: en.dateISO, entries: [en] });
    }
    return groups;
  };

  return { near: byDay(entries), far: byDay(farEntries) };
}
