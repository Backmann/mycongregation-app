import type { LocalNeedsSpeaker, LocalNeedsTopic, LocalNeedsWeek } from './api';

/**
 * The «Местные потребности» screen's arithmetic, apart from its drawing
 * (28 October 2026).
 *
 * The left column is the weeks ahead that concern the body of elders: those
 * whose programme has the workbook's «Местные потребности» part or already
 * carries one of our topics, and those a topic was planned for before their
 * programme came. Nothing is put into a programme by itself — a planned topic
 * whose week is now there is offered «Поставить».
 */

export type WeekPart = LocalNeedsWeek['parts'][number];

export interface BoardSlot {
  /** The part, when the week's programme is there. */
  part: WeekPart | null;
  /** The topic standing on it, or planned for the week. */
  topic: LocalNeedsTopic | null;
  /** Planned only: the week was chosen before its programme existed. */
  planned: boolean;
}

export interface BoardWeek {
  weekStartDate: string;
  /** The day of the midweek meeting; the Monday when unknown. */
  day: string;
  /** The week's programme has been imported. */
  hasProgramme: boolean;
  week: LocalNeedsWeek | null;
  slots: BoardSlot[];
}

export function buildBoard(
  weeks: LocalNeedsWeek[],
  topics: LocalNeedsTopic[],
): BoardWeek[] {
  const live = topics.filter((t) => !t.deletedAt);
  const byId = new Map(live.map((t) => [t.id, t]));
  const out = new Map<string, BoardWeek>();

  for (const w of weeks) {
    const slots: BoardSlot[] = w.parts
      .filter((p) => p.localNeeds || p.topicId)
      .map((p) => ({
        part: p,
        topic: p.topicId ? (byId.get(p.topicId) ?? null) : null,
        planned: false,
      }));
    // A topic planned for this week before its programme came.
    for (const t of live) {
      if (t.plannedWeek === w.weekStartDate) {
        slots.push({ part: null, topic: t, planned: true });
      }
    }
    if (slots.length === 0) continue;
    out.set(w.weekStartDate, {
      weekStartDate: w.weekStartDate,
      day: w.meetingDate ?? w.weekStartDate,
      hasProgramme: true,
      week: w,
      slots,
    });
  }

  const today = mondayOf(new Date());
  for (const t of live) {
    const pw = t.plannedWeek;
    if (!pw || pw < today) continue;
    const known = weeks.some((w) => w.weekStartDate === pw);
    if (known) continue;
    const entry = out.get(pw) ?? {
      weekStartDate: pw,
      day: pw,
      hasProgramme: false,
      week: null,
      slots: [],
    };
    entry.slots.push({ part: null, topic: t, planned: true });
    out.set(pw, entry);
  }
  return [...out.values()].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
}

/** The first week ahead with a local-needs part: for the door's line. */
export function nextLocalNeeds(
  weeks: LocalNeedsWeek[],
): { day: string; topicTitle: string | null; filled: boolean } | null {
  for (const w of weeks) {
    const part = w.parts.find((p) => p.localNeeds);
    if (!part) continue;
    return {
      day: w.meetingDate ?? w.weekStartDate,
      topicTitle: part.topicId ? part.partTitle : null,
      filled: !!part.topicId,
    };
  }
  return null;
}

/**
 * Does a topic fit the minutes its part is given?
 *   'fits'   — meant for no more than the part's minutes;
 *   'longer' — meant for more (still allowed: only said);
 *   null     — one of the two is not known.
 */
export function fitOf(
  topicMin: number | null | undefined,
  partMin: number | null | undefined,
): 'fits' | 'longer' | null {
  if (!topicMin || !partMin) return null;
  return topicMin <= partMin ? 'fits' : 'longer';
}

/**
 * The bank in the order it is chosen from for a part of `partMin` minutes:
 * those that fit, the closest first; then those with no minutes; then those
 * meant for longer. Without the part's minutes the order is kept.
 */
export function byFit<T extends { durationMin?: number | null }>(
  topics: T[],
  partMin: number | null | undefined,
): T[] {
  if (!partMin) return topics;
  const rank = (x: T) => {
    const f = fitOf(x.durationMin, partMin);
    if (f === 'fits') return partMin - (x.durationMin as number);
    if (f === null) return 1000;
    return 2000 + (x.durationMin as number) - partMin;
  };
  return topics
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i)
    .map((e) => e.x);
}

/** «Беккер Й.» — short enough for a line of history. */
export function shortName(p: LocalNeedsSpeaker | null | undefined): string | null {
  if (!p) return null;
  if (p.lastName && p.firstName) return `${p.lastName} ${p.firstName.charAt(0)}.`;
  return p.displayName ?? p.lastName ?? null;
}

/** «Беккер Йонас». */
export function fullName(p: LocalNeedsSpeaker | null | undefined): string | null {
  if (!p) return null;
  if (p.lastName && p.firstName) return `${p.lastName} ${p.firstName}`;
  return p.displayName ?? null;
}

/** «6 июля 2025» — the year only when it is not this one. */
export function dayLabel(iso: string, lang: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(lang, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** «ср 11 нояб.» */
export function shortDayLabel(iso: string, lang: string): string {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '');
}

/** The date box: «4» over «НОЯБ». */
export function dayBox(iso: string, lang: string): { day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString(lang, { month: 'short' }).replace('.', '').toUpperCase(),
  };
}

export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoOf(x);
}

export function isoOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Monday of the week a YYYY-MM-DD falls in. */
export function mondayOfISO(iso: string): string {
  return mondayOf(new Date(`${iso}T00:00:00`));
}

/** Loose match so «Гостеприимство» finds «о гостеприимстве». */
export function normalise(v: string): string {
  return v
    .toLowerCase()
    .replace(/[«»"'’.,:;!?()\-—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
