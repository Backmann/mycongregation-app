import type { CongregationSummary } from './api';

/**
 * The line under each door of the «Собрание» contents (27 September).
 *
 * A door used to be titled and described — «Уборка зала · График уборки и как
 * убирать» — the same words every day. Where a figure answers the question a
 * person opens the door with, the line says it instead; amber only where
 * there is something to do. Where the summary has nothing (not for this
 * person, not loaded, failed) the caller keeps the plain description, so the
 * list never jumps and never shows «0» for «don't know».
 *
 * Decisions carried here:
 *  - the programme is JUDGED: meetings not ready are amber;
 *  - the duties are only COUNTED, never amber (20 September);
 *  - a missing cleaning after the meetings is amber only to those who plan
 *    the cleaning, and never in a week without meetings; the weekly
 *    cleaning's gap is not a gap (22 September);
 *  - overdue tasks are amber.
 *
 * Pure — translations come in as `t` — so scripts/check-congregation-lines.mjs
 * runs it.
 */
export type TFn = (key: string, options?: Record<string, unknown>) => string;

export interface DoorLine {
  text: string;
  /** Something to do — drawn in amber. */
  due: boolean;
}

export interface LinePermissions {
  /** Keeps everyone's absences (the door says «Отсутствия», not «Мои»). */
  manageAbsences: boolean;
  /** Plans the cleaning — only he is told of a missing slot. */
  editCleaning: boolean;
}

function dayMonth(iso: string, locale: string, withWeekday = false): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'long',
  });
}

function relativeDay(iso: string, todayISO: string, locale: string, t: TFn): string {
  const days = Math.round(
    (new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayISO}T00:00:00`).getTime()) / 86400000,
  );
  if (days === 0) return t('congregationHub.live.today');
  if (days === 1) return t('congregationHub.live.tomorrow');
  return dayMonth(iso, locale, true);
}

function dowShort(dow: number, locale: string): string {
  // 2024-01-01 was a Monday; ISO weekday 1..7.
  const d = new Date(2024, 0, dow);
  const s = d.toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function congregationLines(
  summary: CongregationSummary,
  perms: LinePermissions,
  t: TFn,
  locale: string,
): Record<string, DoorLine> {
  const lines: Record<string, DoorLine> = {};
  const today = summary.today;

  if (summary.publishers) {
    lines.publishers = { text: t('congregationHub.live.publishers', { count: summary.publishers.count }), due: false };
  }
  lines.groups = {
    text: summary.myGroup
      ? t('congregationHub.live.groupsMine', { count: summary.groups.count, name: summary.myGroup.name })
      : t('congregationHub.live.groups', { count: summary.groups.count }),
    due: false,
  };
  if (summary.myGroup) {
    lines.myGroup = {
      text: summary.myGroup.overseerName
        ? t('congregationHub.live.myGroup', { name: summary.myGroup.name, overseer: summary.myGroup.overseerName })
        : summary.myGroup.name,
      due: false,
    };
  }

  // Absences: the door says whose list it opens; the line follows it.
  const mine = summary.absences.mine;
  const mineLine = mine
    ? mine.startDate <= today
      ? t('congregationHub.live.awayMineNow', { date: dayMonth(mine.endDate ?? mine.startDate, locale) })
      : t('congregationHub.live.awayMineNext', {
          range:
            mine.endDate && mine.endDate !== mine.startDate
              ? `${dayMonth(mine.startDate, locale)} – ${dayMonth(mine.endDate, locale)}`
              : dayMonth(mine.startDate, locale),
        })
    : null;
  if (perms.manageAbsences && summary.absences.readAll && summary.absences.awayNow !== null) {
    lines.absences = {
      text:
        summary.absences.awayNow > 0
          ? t('congregationHub.live.awayNow', { count: summary.absences.awayNow })
          : t('congregationHub.live.awayNobody'),
      due: false,
    };
  } else if (!perms.manageAbsences && mineLine) {
    lines.absences = { text: mineLine, due: false };
  }

  if (summary.programme) {
    const p = summary.programme;
    lines.programme =
      p.notReady > 0
        ? { text: t('congregationHub.live.programmeNotReady', { count: p.notReady, window: t('home.attention.window', { count: p.windowWeeks }) }), due: true }
        : p.loadedUntil
          ? { text: t('congregationHub.live.programmeUntil', { date: dayMonth(p.loadedUntil, locale) }), due: false }
          : { text: t('congregationHub.live.programmeNone'), due: true };
  }

  if (summary.duties.next) {
    const d = summary.duties.next;
    lines.duties = {
      text: t('congregationHub.live.duties', {
        when: capitalize(relativeDay(d.date, today, locale, t)),
        assigned: d.assigned,
        total: d.total,
      }),
      due: false,
    };
  }

  const talk = summary.talks.nextIncoming;
  if (talk) {
    lines.talks = {
      text: t('congregationHub.live.talk', {
        date: dayMonth(talk.date, locale),
        who: [talk.speaker, talk.congregation].filter(Boolean).join(' · ') || t('congregationHub.live.talkNoName'),
      }),
      due: false,
    };
  }

  if (summary.tasks) {
    const k = summary.tasks;
    lines.tasks =
      k.open === 0
        ? { text: t('congregationHub.live.tasksNone'), due: false }
        : k.overdue > 0
          ? { text: t('congregationHub.live.tasksOverdue', { count: k.open, overdue: k.overdue }), due: true }
          : { text: t('congregationHub.live.tasks', { count: k.open }), due: false };
  }

  // Cleaning: one's own group's next turn for everyone who has a group;
  // this week's groups for those who plan it.
  const c = summary.cleaning;
  if (perms.editCleaning) {
    const missing = c.thisWeek.meetingsHeld && !c.thisWeek.afterMeeting;
    lines.cleaning = missing
      ? { text: t('congregationHub.live.cleaningMissing'), due: true }
      : c.thisWeek.afterMeeting
        ? {
            text: [
              t('congregationHub.live.cleaningAfter', { name: c.thisWeek.afterMeeting }),
              c.thisWeek.thorough ? t('congregationHub.live.cleaningWeekly', { name: c.thisWeek.thorough }) : null,
            ]
              .filter(Boolean)
              .join(' · '),
            due: false,
          }
        : { text: t('congregationHub.live.cleaningNoMeetings'), due: false };
  } else if (c.mine) {
    const kind =
      c.mine.slot === 'thorough'
        ? t('congregationHub.live.kindWeekly')
        : c.mine.slot === 'general'
          ? t('congregationHub.live.kindGeneral')
          : t('congregationHub.live.kindAfter');
    // Short, so the line fits a phone: the planned day if there is one,
    // «на этой неделе», or the week's Monday with a short month.
    const thisMonday = mondayOf(today);
    const when = c.mine.plannedAt
      ? shortDay(localDay(c.mine.plannedAt), locale, true)
      : c.mine.weekStart === thisMonday
        ? t('congregationHub.live.thisWeek')
        : t('congregationHub.live.weekOf', { date: shortDay(c.mine.weekStart, locale) });
    lines.cleaning = { text: t('congregationHub.live.cleaningMine', { kind, when }), due: false };
  }

  if (summary.meetingPlace) {
    const m = summary.meetingPlace;
    lines.meetingPlace = {
      text: `${dowShort(m.midweekDow, locale)} ${m.midweekTime} · ${dowShort(m.weekendDow, locale)} ${m.weekendTime}`,
      due: false,
    };
  }

  return lines;
}

function shortDay(iso: string, locale: string, withWeekday = false): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
  });
}

/** The Monday of a calendar day's week, on this clock. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function capitalize(x: string): string {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}

/** The calendar day of an instant, on this device's clock. */
function localDay(instant: string): string {
  return ymd(new Date(instant));
}
