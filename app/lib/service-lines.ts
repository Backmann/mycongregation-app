import type {
  CartWeekView,
  FieldServiceMeeting,
  GroupVisitRow,
  MyReportStanding,
  PendingAttendance,
  ReportCollection,
  SpecialEvent,
} from './api';
import { arrangeFieldDay } from './field-audience';

/**
 * The line under each door of the «Служение» contents (4 October 2026).
 *
 * The doors used to carry a description — «Отчёты о служении и активность» —
 * the same words every day. Where the screen behind a door has an answer to
 * the question a person opens it with, the line says it instead; amber only
 * where there is something for THIS reader to do. Where there is nothing to
 * say (not loaded, failed, not his) the caller keeps the plain description,
 * so the list never jumps and never shows «0» for «don't know».
 *
 * EVERY LINE IS READ FROM THE ANSWER ITS OWN SCREEN READS — the same request,
 * the same rule — so a line cannot say what the screen behind it would not.
 * Nothing is counted a second way here.
 *
 * Decisions carried here:
 *  - one's own report not handed in is amber: only he can hand it in;
 *  - the collection («сдали 61 из 88») is counted, never amber: the card on
 *    Home already speaks of the deadline;
 *  - unrecorded attendance is amber only to those who record it;
 *  - groups without a visit are amber only to those who plan the visits, and
 *    only from May — the month the reminder task itself appears (21 August):
 *    in October every group is «not yet visited», and that is not a fault;
 *  - which field-service meeting is «mine» is decided by lib/field-audience,
 *    the rule the four screens already share.
 *
 * Pure — translations come in as `t` — so scripts/check-service-lines.mjs
 * runs it.
 */
export type TFn = (key: string, options?: Record<string, unknown>) => string;

export interface ServiceLine {
  text: string;
  /** Something to do — drawn in amber. */
  due: boolean;
}

export interface ServiceLinesInput {
  /** The reader's day and time of day, 'YYYY-MM-DD' and 'HH:MM'. */
  today: string;
  nowHM: string;
  /** The reader's publisher card and group, when he has them. */
  me: string | null;
  myGroupId: string | null;
  standing?: MyReportStanding | null;
  collection?: ReportCollection | null;
  attendance?: PendingAttendance | null;
  /** The weeks from this Monday on, as Home loads them. */
  fieldMeetings?: FieldServiceMeeting[] | null;
  /** This week and the next, in that order; null where no week is set up. */
  cartWeeks?: (CartWeekView | null)[] | null;
  groupVisits?: { groups: GroupVisitRow[] } | null;
  events?: SpecialEvent[] | null;
  /** How many serve as auxiliary pioneers this month. */
  auxCount?: number | null;
}

export interface ServiceLinePermissions {
  /** Enters the attendance figures — only he is told of a missing one. */
  recordsAttendance: boolean;
  /** Plans the field-service meetings, and with them the visits to groups. */
  plansVisits: boolean;
}

/** As components/SpecialEventForm names it; a string here keeps this pure. */
const CO_VISIT = 'circuit_overseer_visit';
/** The reminder task about unvisited groups appears on 1 May. */
const VISITS_DUE_FROM_MONTH = 5;
const VISITS_DUE_UNTIL_MONTH = 8;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dateOf(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

function dayMonth(iso: string, locale: string, withWeekday = false): string {
  return dateOf(iso).toLocaleDateString(locale, {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'long',
  });
}

/** «Сентябрь» — the month's own name, for the head of a line. */
function monthName(iso: string, locale: string): string {
  return capitalize(dateOf(`${iso.slice(0, 7)}-01`).toLocaleDateString(locale, { month: 'long' }));
}

function addDaysISO(iso: string, n: number): string {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** «сегодня, 10:00» · «завтра, 10:00» · «сб, 10 октября, 10:00». */
function when(iso: string, time: string | null, today: string, locale: string, t: TFn): string {
  const days = Math.round((dateOf(iso).getTime() - dateOf(today).getTime()) / 86400000);
  const day =
    days === 0
      ? t('congregationHub.live.today').toLowerCase()
      : days === 1
        ? t('congregationHub.live.tomorrow').toLowerCase()
        : dayMonth(iso, locale, true);
  return time ? `${day}, ${time.slice(0, 5)}` : day;
}

/** «10–15 ноября» within a month, «28 октября – 2 ноября» across two. */
function range(start: string, end: string | null, locale: string): string {
  if (!end || end === start) return dayMonth(start, locale);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8, 10))}–${dayMonth(end, locale)}`;
  }
  return `${dayMonth(start, locale)} – ${dayMonth(end, locale)}`;
}

export function serviceLines(
  input: ServiceLinesInput,
  perms: ServiceLinePermissions,
  t: TFn,
  locale: string,
): Record<string, ServiceLine> {
  const lines: Record<string, ServiceLine> = {};
  const { today } = input;
  const L = (key: string, options?: Record<string, unknown>) => t(`serviceHub.live.${key}`, options);

  // --- Отчёты: the reader's own report for the month being collected. -------
  const st = input.standing;
  if (st && st.applicable && st.reportMonth) {
    const month = monthName(st.reportMonth, locale);
    lines.reports = st.submitted
      ? { text: L('reportDone', { month }), due: false }
      : { text: L('reportDue', { month }), due: true };
  }

  // --- Сводка за месяц: how the collection stands, for those who collect. ---
  const col = input.collection;
  if (col && col.scope === 'congregation') {
    lines.summary = {
      text: L('collected', {
        month: monthName(col.reportMonth, locale),
        received: col.received,
        expected: col.expected,
      }),
      due: false,
    };
  }

  // --- Посещаемость встреч. ------------------------------------------------
  const att = input.attendance;
  if (att) {
    lines.attendance =
      att.outstandingThisYear > 0
        ? { text: L('attendanceMissing', { count: att.outstandingThisYear }), due: perms.recordsAttendance }
        : { text: L('attendanceDone'), due: false };
  }

  // --- Встречи для проповеди: the next one that is the reader's. ------------
  if (input.fieldMeetings) {
    const byDay = new Map<string, FieldServiceMeeting[]>();
    for (const m of input.fieldMeetings) {
      const date = addDaysISO(m.weekStartDate, m.dayOfWeek - 1);
      if (date < today) continue;
      byDay.set(date, [...(byDay.get(date) ?? []), m]);
    }
    let next: { date: string; time: string; mine: boolean } | null = null;
    for (const date of [...byDay.keys()].sort()) {
      const day = arrangeFieldDay(byDay.get(date) as FieldServiceMeeting[], input.myGroupId, input.me);
      const place = day.shown.find(
        (p) =>
          // Not his that day: his group is on a visit, or he is away on one.
          !p.notForMyGroupToday &&
          !p.awayOnVisitTo &&
          // Another group's visit is shown to him as «только для группы …».
          !(p.audience === 'visit' && !p.own && !p.mine && !!input.myGroupId) &&
          // Today's meeting that has already begun is not «the next».
          (date > today || p.meeting.startTime.slice(0, 5) >= input.nowHM),
      );
      if (place) {
        next = { date, time: place.meeting.startTime, mine: place.mine };
        break;
      }
    }
    lines.fieldService = next
      ? {
          text: L(next.mine ? 'fieldMine' : 'fieldNext', {
            when: when(next.date, next.time, today, locale, t),
          }),
          due: false,
        }
      : { text: L('fieldNone'), due: false };
  }

  // --- Служение в общественных местах. --------------------------------------
  if (input.cartWeeks) {
    const weeks = input.cartWeeks.filter((w): w is CartWeekView => !!w);
    const myShift = weeks
      .flatMap((w) => (w.status === 'published' ? w.slots : []))
      .filter(
        (s) =>
          s.myAssignment === true &&
          (s.date > today || (s.date === today && s.endTime.slice(0, 5) > input.nowHM)),
      )
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0];
    const collecting = weeks.find((w) => w.status === 'collecting');
    const thisWeek = input.cartWeeks[0];
    if (myShift) {
      lines.cart = {
        text: L('cartMine', {
          when: when(myShift.date, myShift.startTime, today, locale, t),
          place: myShift.locationName,
        }),
        due: false,
      };
    } else if (collecting) {
      const date = dayMonth(collecting.weekStartDate, locale);
      lines.cart = {
        text: L(collecting.slots.some((s) => s.myRequest) ? 'cartRequested' : 'cartCollecting', { date }),
        due: false,
      };
    } else if (thisWeek && thisWeek.status === 'published' && input.me) {
      lines.cart = { text: L('cartNotMine'), due: false };
    }
  }

  // --- Служебный старейшина: visits to the groups. --------------------------
  if (input.groupVisits && input.groupVisits.groups.length > 0) {
    const groups = input.groupVisits.groups;
    // The page's own rule: a planned visit has not happened yet.
    const made = (g: GroupVisitRow) => g.madeThisYear ?? g.visitsThisYear;
    const waiting = groups.filter((g) => made(g) === 0);
    const mine = input.myGroupId ? groups.find((g) => g.serviceGroupId === input.myGroupId) : undefined;
    const month = Number(today.slice(5, 7));
    const lateInYear = month >= VISITS_DUE_FROM_MONTH && month <= VISITS_DUE_UNTIL_MONTH;
    if (!perms.plansVisits && mine?.nextVisitDate && mine.nextVisitDate >= today) {
      lines.serviceOverseer = {
        text: L('visitMyGroup', { when: when(mine.nextVisitDate, null, today, locale, t) }),
        due: false,
      };
    } else if (waiting.length === 0) {
      lines.serviceOverseer = { text: L('visitsAll'), due: false };
    } else if (lateInYear) {
      lines.serviceOverseer = {
        text: L('visitsWaiting', { names: waiting.map((g) => g.name).join(', ') }),
        due: perms.plansVisits,
      };
    } else {
      lines.serviceOverseer = {
        text: L('visitsCount', { made: groups.length - waiting.length, total: groups.length }),
        due: false,
      };
    }
  }

  // --- График районного: the visit in progress, or the next one. ------------
  if (input.events) {
    const visits = input.events
      .filter((e) => e.type === CO_VISIT && (e.endDate ?? e.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const v = visits[0];
    lines.coSchedule = v
      ? {
          text: L(v.date <= today ? 'coNow' : 'coNext', { range: range(v.date, v.endDate, locale) }),
          due: false,
        }
      : { text: L('coNone'), due: false };
  }

  // --- Подсобное пионерское служение. ---------------------------------------
  if (typeof input.auxCount === 'number') {
    const month = monthName(today, locale);
    lines.auxPioneers =
      input.auxCount > 0
        ? { text: L('auxCount', { month, count: input.auxCount }), due: false }
        : { text: L('auxNone', { month }), due: false };
  }

  return lines;
}
