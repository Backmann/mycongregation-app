/**
 * Shared logic for "my assignments" rows — used by the Home card and the
 * full-list screen so the two never drift apart.
 */
import { MeetingSettingsVersion, MyAssignmentItem } from './api';
import { effectiveVersionFor } from './meeting-schedule';
import { addDays, formatDateISO } from './dates';
import { getPartLabel } from './parts';

type TFunc = (key: string, options?: any) => string;

export interface RefinedTask {
  item: MyAssignmentItem;
  dateISO: string;
  weekOnly: boolean;
  meetingTime?: string;
}

/**
 * Resolves each aggregator item to a concrete calendar date (and the meeting
 * time where the meeting settings know it), drops past items, sorts by date.
 */
export function refineMyTasks(
  items: MyAssignmentItem[],
  versions: MeetingSettingsVersion[],
  todayISO: string,
): RefinedTask[] {
  const refined: RefinedTask[] = [];
  for (const item of items) {
    let dateISO: string | null = null;
    let weekOnly = false;
    let meetingTime: string | undefined;
    if (item.date) {
      dateISO = item.date;
    } else if (
      item.kind === 'field_service' &&
      item.weekStartDate &&
      item.dayOfWeek
    ) {
      dateISO = formatDateISO(
        addDays(new Date(`${item.weekStartDate}T00:00:00`), item.dayOfWeek - 1),
      );
    } else if (
      (item.kind === 'meeting' || item.kind === 'duty') &&
      item.weekStartDate &&
      (item.eventType === 'midweek' || item.eventType === 'weekend')
    ) {
      const v = effectiveVersionFor(versions, item.weekStartDate);
      const dow = item.eventType === 'midweek' ? v?.midweekDow : v?.weekendDow;
      if (v && dow) {
        dateISO = formatDateISO(
          addDays(new Date(`${item.weekStartDate}T00:00:00`), dow - 1),
        );
        meetingTime =
          item.eventType === 'midweek' ? v.midweekTime : v.weekendTime;
      }
    }
    if (!dateISO) {
      dateISO = item.weekStartDate ?? item.sortDate;
      weekOnly = true;
    }
    // Drop items already in the past (week-scoped: past once the week ends).
    if (weekOnly) {
      const weekEnd = formatDateISO(
        addDays(new Date(`${dateISO}T00:00:00`), 6),
      );
      if (weekEnd < todayISO) continue;
    } else if (dateISO < todayISO) {
      continue;
    }
    refined.push({ item, dateISO, weekOnly, meetingTime });
  }
  refined.sort(
    (a, b) =>
      a.dateISO.localeCompare(b.dateISO) ||
      (a.item.partOrder ?? 999) - (b.item.partOrder ?? 999),
  );
  return refined;
}

/** Row title: part title, translated duty/cleaning, "you conduct" etc. */
export function taskTitle(item: MyAssignmentItem, t: TFunc): string {
  if (item.kind === 'duty') {
    return t(`home.dutyTypes.${item.label}`, item.label);
  }
  if (item.kind === 'cleaning') {
    return t(`home.cleaningSlots.${item.label}`, item.label);
  }
  if (item.kind === 'meeting') {
    // label is either a human part title (from EPUB) or a raw partKey
    // (e.g. weekend_chairman); getPartLabel translates known keys and
    // returns the input unchanged for anything not in the registry.
    // For the opening Treasures talk, show only the topic (mirror of the
    // schedule screen) — drop the enriched note after ": ".
    let raw = item.label;
    if (item.partKey === 'treasures_talk') {
      const idx = raw.indexOf(': ');
      if (idx > 0) raw = raw.slice(0, idx);
    }
    const label = getPartLabel(raw);
    return (
      label +
      (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '')
    );
  }
  if (item.kind === 'field_service') {
    return t('home.fieldService.leading');
  }
  return item.label;
}

/** Date part of the subtitle ("сб, 13 июня" or "Неделя с 15 июня"). */
export function taskDateLabel(
  r: RefinedTask,
  t: TFunc,
  locale: string,
): string {
  const d = new Date(`${r.dateISO}T00:00:00`);
  if (r.weekOnly) {
    return t('home.weekOf', {
      date: d.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
      }),
    });
  }
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

/** Full subtitle: date · time · meeting type/kind · address. */
export function taskMeta(r: RefinedTask, t: TFunc, locale: string): string {
  const bits: string[] = [taskDateLabel(r, t, locale)];
  const time = r.item.time ?? r.meetingTime;
  if (time) {
    bits.push(r.item.endTime ? `${time}\u2013${r.item.endTime}` : time);
  }
  if (
    (r.item.kind === 'meeting' || r.item.kind === 'duty') &&
    (r.item.eventType === 'midweek' || r.item.eventType === 'weekend')
  ) {
    bits.push(t(`home.eventTypes.${r.item.eventType}`));
  } else {
    bits.push(t(`home.kinds.${r.item.kind}`));
  }
  if (r.item.kind === 'field_service' && r.item.location) {
    bits.push(r.item.location);
  }
  return bits.join(' \u00b7 ');
}
