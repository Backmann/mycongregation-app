/**
 * The circuit overseer's visit week, as a table and as a list of gaps
 * (audit, 17 November 2026).
 *
 * A real visit (August 2026, counted on the live site without names) is a
 * table, not a list: the same slots every day — outings at 10:00 and 14:00,
 * lunch at 12:15, a lunch box — and the work is putting a name in each. The
 * day list showed it as some twenty rows in a column, three screens long on a
 * laptop, and the gaps had to be found by eye. This module turns the items
 * into rows of slots × days, and names every gap by its day.
 *
 * Pure: no React, no i18n — the screen supplies the words.
 */

export type WeekItem = {
  id: string;
  kind: string;
  itemDate: string;
  startTime: string | null;
  forWife: boolean;
  withWife: boolean;
  assigneeName: string | null;
  assigneeText: string | null;
  sortOrder: number;
};

export type WeekRow<T extends WeekItem> = {
  /** kind and hour: «field_service|10:00», «lunch_box|». */
  key: string;
  kind: string;
  time: string | null;
  /** Every visit day, in order, with what stands on it in this slot. */
  cells: { date: string; items: T[] }[];
};

/** The kinds in the order a day runs when two share the same hour. */
const KIND_ORDER = [
  'field_service',
  'lunch',
  'pastoral',
  'pioneers',
  'elders',
  'lunch_box',
  'document_review',
];

const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k);
  return i < 0 ? KIND_ORDER.length : i;
};

/**
 * Rows built from the items themselves, never from a fixed list: a slot that
 * only one visit has gets a row of its own, so a week of another shape does
 * not break the table. Rows run by hour; a slot without an hour (the lunch
 * box) goes last. Items outside the visit days are not placed here — the
 * screen keeps them in its own «outside the visit days» block.
 */
export function weekRows<T extends WeekItem>(items: T[], days: string[]): WeekRow<T>[] {
  const dayset = new Set(days);
  const rows = new Map<string, WeekRow<T>>();
  for (const it of items) {
    if (!dayset.has(it.itemDate)) continue;
    const time = it.startTime ? it.startTime.slice(0, 5) : null;
    const key = `${it.kind}|${time ?? ''}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, kind: it.kind, time, cells: days.map((date) => ({ date, items: [] })) };
      rows.set(key, row);
    }
    row.cells[days.indexOf(it.itemDate)].items.push(it);
  }
  for (const row of rows.values())
    for (const c of row.cells) c.items.sort((a, b) => a.sortOrder - b.sortOrder);
  return [...rows.values()].sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? -1 : 1;
    return (a.time ?? '').localeCompare(b.time ?? '') || kindRank(a.kind) - kindRank(b.kind);
  });
}

export type WeekGaps = {
  accommodation: boolean;
  /**
   * Visit days with no lunch or lunch box that has someone's name — an empty
   * lunch laid by the template is still a gap.
   */
  lunchDays: string[];
  /**
   * Outings without a partner — his, or his wife's on her own. Going out
   * together, husband and wife are each other's company: no gap.
   */
  partners: { id: string; date: string; time: string | null; wife: boolean }[];
  /** Shepherding calls without the elder who goes along. */
  pastoral: { id: string; date: string; time: string | null }[];
};

/**
 * What still has nobody's name on it — the same three facts the readiness
 * line always counted, now with the day of each, so the planner does not
 * have to search the week for «обед не назначен на 1 день».
 */
export function weekGaps(
  items: WeekItem[],
  days: string[],
  accommodationSet: boolean,
): WeekGaps {
  const named = (i: WeekItem) => !!(i.assigneeName ?? i.assigneeText ?? '').trim();
  const lunch = new Set(
    items
      .filter((i) => (i.kind === 'lunch' || i.kind === 'lunch_box') && named(i))
      .map((i) => i.itemDate),
  );
  const dayset = new Set(days);
  const slot = (i: WeekItem) => ({
    id: i.id,
    date: i.itemDate,
    time: i.startTime ? i.startTime.slice(0, 5) : null,
  });
  const byTime = (a: WeekItem, b: WeekItem) =>
    a.itemDate.localeCompare(b.itemDate) ||
    (a.startTime ?? '99').localeCompare(b.startTime ?? '99');
  return {
    accommodation: !accommodationSet,
    lunchDays: days.filter((d) => !lunch.has(d)),
    partners: items
      .filter(
        (i) =>
          i.kind === 'field_service' &&
          !i.withWife &&
          dayset.has(i.itemDate) &&
          !named(i),
      )
      .sort(
        (a, b) =>
          a.itemDate.localeCompare(b.itemDate) ||
          (a.startTime ?? '99').localeCompare(b.startTime ?? '99') ||
          Number(a.forWife) - Number(b.forWife),
      )
      .map((i) => ({
        id: i.id,
        date: i.itemDate,
        time: i.startTime ? i.startTime.slice(0, 5) : null,
        wife: i.forWife,
      })),
    pastoral: items
      .filter(
        (i) => i.kind === 'pastoral' && !i.forWife && dayset.has(i.itemDate) && !named(i),
      )
      .sort(byTime)
      .map(slot),
  };
}

/** Wide enough for the table: six days of about 150 px beside the slot names. */
export const WEEK_GRID_FROM = 900;
