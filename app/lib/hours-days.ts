/**
 * WHICH DAYS AN HOURS ENTRY MAY GO TO (28 November 2026, after the month
 * change was walked through on the stand). Pure, so the gate can run it
 * (scripts/check-hours-days.mjs).
 *
 * - A sheet opened over a past month offers that month's last two days, never
 *   «Сегодня»: written on 1 December from the November screen, an entry went
 *   into December.
 * - «Вчера» is not offered when yesterday's month is closed to him — its
 *   report is in, or collection has closed: the server refuses it.
 * - A day ahead of the congregation's today, or in a month no longer open, is
 *   said in the sheet at once instead of vanishing after the send.
 */

/** «2026-12-01», −1 → «2026-11-30». */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** «2026-11» → «2026-11-30». */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Why a day may not be written, or null when it may: not ahead of today, and
 * in a month still open to him — the server's own rule. Unknown open months
 * (not loaded yet) leave only the first half; the server answers the rest.
 */
export function dayProblem(
  day: string,
  today: string,
  openMonths?: string[],
): 'future' | 'closed' | null {
  if (day > today) return 'future';
  if (openMonths && !openMonths.includes(day.slice(0, 7))) return 'closed';
  return null;
}

/**
 * The two days a sheet offers first: today and yesterday — or, over a past
 * month, its own last two days. The second is left out when it cannot be
 * written (unless it is the day of the entry being changed).
 */
export function sheetDays(
  today: string,
  forMonth: string | undefined,
  openMonths: string[] | undefined,
  entryDay?: string,
): { past: boolean; first: string; second: string; secondShown: boolean } {
  const past = !!forMonth && forMonth < today.slice(0, 7);
  const first = past ? lastDayOfMonth(forMonth as string) : today;
  const second = shiftDay(first, -1);
  const secondShown = !dayProblem(second, today, openMonths) || entryDay === second;
  return { past, first, second, secondShown };
}

/** His unsent entries for a month, «YYYY-MM» — they are counted into its report. */
export function unsentInMonth(
  ops: ReadonlyArray<{ type: 'put' | 'delete'; body?: { day: string } }>,
  month: string,
): number {
  return ops.filter((o) => o.type === 'put' && o.body?.day.slice(0, 7) === month).length;
}
