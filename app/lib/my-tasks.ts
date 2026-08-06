/**
 * Shared logic for "my assignments" rows — used by the Home card and the
 * full-list screen so the two never drift apart.
 */
import {
  MeetingSettingsVersion,
  MyAssignmentItem,
  SpecialEvent,
} from './api';
import { effectiveVersionFor } from './meeting-schedule';
import { SECTION_COLORS } from './section-colors';
import { addDays, formatDateISO } from './dates';
import { getPartLabel, resolveSubsection, SUBSECTIONS } from './parts';
import { weekRules } from './week-rules';

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
  /**
   * Special events of the weeks in question.
   *
   * Without them this worked out the day of a meeting from the settings alone
   * — so on a week the circuit overseer visits, a brother saw his part on the
   * ordinary Thursday while the meeting had moved to Tuesday. week-rules.ts
   * has always known better; it simply was not asked here.
   */
  events: SpecialEvent[] = [],
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
      // The same authority the rest of the app uses: it knows that a visit
      // moves the midweek meeting, and that a congress week has none at all.
      const rules = weekRules({
        weekStartISO: item.weekStartDate,
        version: v,
        events,
      });
      const kind = item.eventType === 'midweek' ? 'midweek' : 'weekend';
      const fromRules = rules.meetingsHeld ? rules.dateOf(kind) : null;
      if (fromRules) {
        dateISO = fromRules;
        meetingTime =
          item.eventType === 'midweek' ? v?.midweekTime : v?.weekendTime;
      } else {
        const dow =
          item.eventType === 'midweek' ? v?.midweekDow : v?.weekendDow;
        if (v && dow) {
          dateISO = formatDateISO(
            addDays(new Date(`${item.weekStartDate}T00:00:00`), dow - 1),
          );
          meetingTime =
            item.eventType === 'midweek' ? v.midweekTime : v.weekendTime;
        }
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

/** Song parts keep their full label (the song name is the content). */
const SONG_TASK_KEYS = new Set<string>([
  'mid_song',
  'weekend_song',
  'weekend_opening_song',
]);

/**
 * Prayer parts: show the clean part name only. Their imported partTitle
 * often carries an adjacent part/song joined with " | ", which would
 * confuse the assigned person — they just need "opening/closing prayer".
 */
const PRAYER_TASK_KEYS = new Set<string>([
  'midweek_opening_prayer',
  'midweek_closing_prayer',
  'weekend_opening_prayer',
  'weekend_closing_prayer',
]);

/**
 * Section label for a meeting task (e.g. "Сокровища из Слова Бога",
 * "Изучение Сторожевой Башни"), shown as a small subheading. Returns null
 * for non-meeting tasks and for parts that belong to no labeled section
 * (chairman, prayers, opening/closing songs).
 */
export function taskSubsectionLabel(
  item: MyAssignmentItem,
  t: TFunc,
): string | null {
  if (item.kind === 'cleaning') {
    if (item.label === 'thorough' && item.windows?.length) {
      return t('home.cleaning.windows', {
        list: item.windows.join(', '),
      });
    }
    return null;
  }
  if (item.kind !== 'meeting' || !item.partKey) return null;
  const sub = resolveSubsection(item.partKey);
  // 'opening' (chairman/prayers/opening song) and 'closing' (closing prayer)
  // carry no section heading.
  if (sub === 'opening' || sub === 'closing') return null;
  const meta = SUBSECTIONS[sub];
  return meta ? t(meta.i18nKey) : null;
}


/**
 * Premium category accents for tasks: each kind gets a color, a tinted
 * background and an icon, so the eye can separate weekend meetings, midweek
 * meetings, duties, cleaning, field service and the rest at a glance.
 */
export interface TaskVisual {
  color: string;
  bg: string;
  icon: string;
}

export function taskVisual(
  item: Pick<MyAssignmentItem, 'kind' | 'eventType'>,
): TaskVisual {
  // Colour by WHAT the task is, never by which meeting it sits in: a duty at
  // the midweek meeting used to come out in the meeting's colour, which made
  // the home screen disagree with the schedule. The icon still varies.
  const meeting = SECTION_COLORS.meeting;
  switch (item.kind) {
    case 'duty':
      return {
        color: SECTION_COLORS.duty.color,
        bg: SECTION_COLORS.duty.soft,
        icon: 'construct-outline',
      };
    case 'cleaning':
      return {
        color: SECTION_COLORS.cleaning.color,
        bg: SECTION_COLORS.cleaning.soft,
        icon: 'sparkles-outline',
      };
    case 'field_service':
      return {
        color: SECTION_COLORS.field_service.color,
        bg: SECTION_COLORS.field_service.soft,
        icon: 'walk-outline',
      };
    case 'cart':
      return {
        color: SECTION_COLORS.field_service.color,
        bg: SECTION_COLORS.field_service.soft,
        icon: 'cart-outline',
      };
    case 'outgoing_talk':
      // A talk given at another congregation is still a meeting part.
      return { color: meeting.color, bg: meeting.soft, icon: 'mic-outline' };
    case 'co_lunch':
      // Hospitality around the visit — its own hue, outside the four sections.
      return { color: '#7c3aed', bg: '#f5f3ff', icon: 'restaurant-outline' };
    default:
      return {
        color: meeting.color,
        bg: meeting.soft,
        icon:
          item.eventType === 'weekend' ? 'people-outline' : 'book-outline',
      };
  }
}

/** Row title: part title, translated duty/cleaning, "you conduct" etc. */
export function taskTitle(item: MyAssignmentItem, t: TFunc): string {
  if (item.kind === 'duty') {
    const label = t(`home.dutyTypes.${item.label}`, item.label);
    // Microphones are numbered on the schedule; keep the home card as precise.
    if (item.label === 'microphone' && item.slotIndex !== undefined) {
      return `${label} ${item.slotIndex + 1}`;
    }
    return label;
  }
  if (item.kind === 'cleaning') {
    // Cleaning is group work, not a personal assignment — frame it as a
    // heads-up for the whole service group rather than a task card title.
    if (item.label === 'thorough') {
      return t('home.cleaning.thoroughGroup');
    }
    if (item.label === 'after_meeting') {
      return t('home.cleaning.afterMeetingGroup');
    }
    if (item.label === 'general') {
      return t('home.cleaning.generalTitle');
    }
    return t(`home.cleaningSlots.${item.label}`, item.label);
  }
  if (item.kind === 'meeting') {
    // label is either a human part title (from EPUB) or a raw partKey
    // (e.g. weekend_chairman); getPartLabel translates known keys and
    // returns the input unchanged for anything not in the registry.
    // Brief titles: show only the topic (drop the enriched note after
    // ": "), to match the schedule's clean look. Songs keep their full
    // label (the song name IS the content); everything else is trimmed.
    // Prayers: clean name only, ignore the joined imported title.
    if (item.partKey && PRAYER_TASK_KEYS.has(item.partKey)) {
      return getPartLabel(item.partKey);
    }
    let raw = item.label;
    if (item.partKey && !SONG_TASK_KEYS.has(item.partKey)) {
      const idx = raw.indexOf(': ');
      if (idx > 0) raw = raw.slice(0, idx);
    }
    const label = getPartLabel(raw);
    // Who the pair is, not merely that there is one. «Оттачиваем навыки
    // (напарник)» left the brother to guess whom he is helping, and the pair
    // is half of what he needs to know before the meeting.
    const withWhom = item.partnerName
      ? ` · ${t('home.meeting.withPartner', { name: item.partnerName })}`
      : '';
    return (
      label +
      (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '') +
      withWhom
    );
  }
  if (item.kind === 'field_service') {
    // The assistant is not leading it, and telling him he is would be worse
    // than telling him nothing: he would arrive expecting to conduct.
    // A visit is named as a visit, whoever is reading it. «Встреча для
    // проповеди — вы ведёте» described the mechanics and hid the occasion;
    // the overseer and his assistant are going to the same thing, and one
    // thing deserves one name.
    const base = item.serviceOverseerVisit
      ? t('home.fieldService.overseerVisitTitle')
      : t('home.fieldService.leading');
    // WHOSE group, and WITH WHOM. «Провожу встречу для проповеди» left both
    // unanswered, and a visit is to a particular group with a particular
    // brother — neither should have to be asked of somebody else.
    const parts = [base];
    if (item.groupName) {
      parts.push(t('home.fieldService.forGroup', { name: item.groupName }));
    }
    if (item.visitWithName) {
      parts.push(t('home.fieldService.withWhom', { name: item.visitWithName }));
    }
    return parts.join(' · ');
  }
  if (item.kind === 'co_lunch') {
    // A lunch and a lunch box are two different things to organise; the server
    // sends which one in `label`.
    return item.label === 'lunch_box'
      ? t('home.coLunch.lunchBox')
      : t('home.coLunch.lunch');
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
  } else if (r.item.kind === 'co_lunch') {
    bits.push(
      r.item.label === 'lunch_box'
        ? t('home.kinds.co_lunch_box')
        : t('home.kinds.co_lunch'),
    );
  } else {
    bits.push(t(`home.kinds.${r.item.kind}`));
  }
  if (r.item.kind === 'field_service' && r.item.location) {
    bits.push(r.item.location);
  }
  if (r.item.kind === 'outgoing_talk') {
    if (r.item.congregationName) bits.push(r.item.congregationName);
    if (r.item.location) bits.push(r.item.location);
  }
  if (r.item.kind === 'co_lunch' && r.item.note) {
    bits.push(r.item.note);
  }
  // Weekly cleaning: once the group has picked a day/time, show it here so the
  // home card answers "when" without opening the schedule.
  if (
    r.item.kind === 'cleaning' &&
    r.item.label === 'thorough' &&
    r.item.thoroughPlannedAt
  ) {
    const planned = new Date(r.item.thoroughPlannedAt);
    bits.push(
      `${planned.toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })}, ${planned.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    );
  }
  return bits.join(' \u00b7 ');
}
