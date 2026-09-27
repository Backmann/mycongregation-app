import type { MeetingSettingsVersion, SpecialEvent } from './api';
import { addDays, formatDateISO } from './dates';
import { effectiveVersionFor } from './meeting-schedule';
import { takesMeetingMode } from './event-meeting';

/**
 * How the events screen reads an event (27 September): what kind it is, the
 * one line that says what it means for the meetings, and where it sits in
 * the congregation's year. Pure — the screen and the checks read the same
 * answers.
 */

/** A special talk from the talk journal, as the events screen shows it. */
export interface SpecialTalkItem {
  id: string;
  date: string;
  theme: string;
  speaker: string | null;
  speakerCongregation: string | null;
}

/** One row of the list: an event, or a special talk from the journal. */
export type EventListItem =
  | { kind: 'event'; key: string; date: string; end: string; event: SpecialEvent }
  | { kind: 'talk'; key: string; date: string; end: string; talk: SpecialTalkItem };

export type KindKey =
  | 'special_talk'
  | 'circuit_overseer_visit'
  | 'branch_representative_visit'
  | 'regional_convention'
  | 'circuit_assembly'
  | 'memorial'
  | 'other';

export function kindOf(item: EventListItem): KindKey {
  if (item.kind === 'talk') return 'special_talk';
  const type = item.event.type ?? '';
  switch (type) {
    case 'circuit_overseer_visit':
    case 'branch_representative_visit':
    case 'regional_convention':
    case 'circuit_assembly':
    case 'memorial':
    case 'special_talk':
      return type;
    default:
      return 'other';
  }
}

/** Icon and colour of each kind — one look on the list, the page and the feed. */
export const KIND_LOOK: Record<KindKey, { icon: string; color: string; soft: string }> = {
  special_talk: { icon: 'mic-outline', color: '#a21caf', soft: '#fae8ff' },
  circuit_overseer_visit: { icon: 'briefcase-outline', color: '#0e7490', soft: '#cffafe' },
  branch_representative_visit: { icon: 'business-outline', color: '#4338ca', soft: '#e0e7ff' },
  regional_convention: { icon: 'megaphone-outline', color: '#b45309', soft: '#fef3c7' },
  circuit_assembly: { icon: 'megaphone-outline', color: '#b45309', soft: '#fef3c7' },
  memorial: { icon: 'wine-outline', color: '#be123c', soft: '#ffe4e6' },
  other: { icon: 'calendar-outline', color: '#475569', soft: '#f1f5f9' },
};

export function mondayOfISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  return formatDateISO(addDays(d, 1 - dow));
}

export function addDaysISO(iso: string, n: number): string {
  return formatDateISO(addDays(new Date(`${iso}T00:00:00`), n));
}

/** The service year a day belongs to: September to August, named by its start. */
export function serviceYearOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 9 ? y : y - 1;
}

/** The midweek meeting day of a circuit visit. */
export function visitMidweekDay(e: SpecialEvent): string {
  return addDaysISO(mondayOfISO(e.date), (e.coMidweekDow ?? 2) - 1);
}

export type Effect =
  | { key: 'noMeetingsWeeks'; from: string; to: string }
  | { key: 'visitMidweek'; day: string }
  | { key: 'memorialMidweek' }
  | { key: 'memorialWeekend' }
  | { key: 'noMeetingThatDay' }
  | { key: 'changed'; time: string | null; place: string | null }
  | { key: 'asUsual' }
  | { key: 'atWeekendMeeting' };

/**
 * The one line that says what the item means for the congregation's
 * meetings — the same facts the notifications tell (server event-messages).
 */
export function effectOf(item: EventListItem): Effect | null {
  if (item.kind === 'talk') return { key: 'atWeekendMeeting' };
  const e = item.event;
  const kind = kindOf(item);
  if (kind === 'regional_convention' || kind === 'circuit_assembly') {
    return {
      key: 'noMeetingsWeeks',
      from: mondayOfISO(e.date),
      to: addDaysISO(mondayOfISO(e.endDate ?? e.date), 6),
    };
  }
  if (kind === 'circuit_overseer_visit') return { key: 'visitMidweek', day: visitMidweekDay(e) };
  if (kind === 'memorial') {
    const dow = new Date(`${e.date}T00:00:00`).getDay();
    return dow === 0 || dow === 6 ? { key: 'memorialWeekend' } : { key: 'memorialMidweek' };
  }
  if (!takesMeetingMode(e.type)) return null;
  if (e.meetingMode === 'none' || e.replacesMeeting) return { key: 'noMeetingThatDay' };
  if (e.meetingMode === 'changed') {
    return {
      key: 'changed',
      time: e.meetingTime ?? null,
      place: e.meetingAddress?.trim() || null,
    };
  }
  return { key: 'asUsual' };
}

/** Whether the effect is something to notice (drawn with a mark) or a plain «as usual». */
export function effectIsNotable(effect: Effect | null): boolean {
  return !!effect && effect.key !== 'asUsual' && effect.key !== 'atWeekendMeeting';
}

/**
 * Where «the meeting in the Programme» is for an item, when there is one:
 * the week and which meeting. A special talk and a changed meeting are a
 * meeting of the week; a visit changes the whole week, shown from its
 * midweek day.
 */
export function programmeLinkOf(
  item: EventListItem,
  versions: MeetingSettingsVersion[] | undefined,
): { week: string; meeting: 'midweek' | 'weekend' | 'memorial' } | null {
  if (item.kind === 'talk') return { week: mondayOfISO(item.date), meeting: 'weekend' };
  const e = item.event;
  const kind = kindOf(item);
  if (kind === 'memorial') return { week: mondayOfISO(e.date), meeting: 'memorial' };
  if (kind === 'circuit_overseer_visit') return { week: mondayOfISO(e.date), meeting: 'midweek' };
  if (e.meetingMode === 'changed') {
    const v = effectiveVersionFor(versions, e.date);
    const dow = new Date(`${e.date}T00:00:00`).getDay() || 7;
    return {
      week: mondayOfISO(e.date),
      meeting: v && dow === v.weekendDow ? 'weekend' : 'midweek',
    };
  }
  return null;
}

/** Days from today to the item, 0 for today. */
export function daysUntil(todayISO: string, dateISO: string): number {
  const a = new Date(`${todayISO}T00:00:00`).getTime();
  const b = new Date(`${dateISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/** Events and special talks, as one list in date order. */
export function listItems(events: SpecialEvent[], talks: SpecialTalkItem[]): EventListItem[] {
  const out: EventListItem[] = [
    ...events
      // A special talk made as an event before 27 September is in the bin
      // now; one restored from it still shows, as it would anywhere else.
      .map((e) => ({
        kind: 'event' as const,
        key: `e|${e.id}`,
        date: e.date,
        end: e.endDate ?? e.date,
        event: e,
      })),
    ...talks.map((x) => ({
      kind: 'talk' as const,
      key: `t|${x.id}`,
      date: x.date,
      end: x.date,
      talk: x,
    })),
  ];
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
