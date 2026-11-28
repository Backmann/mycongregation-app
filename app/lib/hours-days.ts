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

type Op = { type: 'put' | 'delete'; id: string; body?: { day: string } };

/**
 * His unsent changes that a month's report may count (28 November 2026,
 * independent review): a new entry of the month, or an entry of the month
 * changed within it. Those are laid over the server's sums and, once the
 * report is in, leave the phone. Anything else — removing one of the
 * month's entries, moving one out of it or into it from another month — is
 * not counted and not dropped: the report keeps the server's figure, and
 * the change is sent and, the month being reported, refused in words. That
 * way no hour is counted twice, in this report and in another month's log.
 *
 * @param elsewhereIds the ids the server holds in other months
 */
export function reportCounted<T extends Op>(
  ops: ReadonlyArray<T>,
  month: string,
  elsewhereIds: ReadonlySet<string>,
): T[] {
  return ops.filter(
    (o) => o.type === 'put' && o.body?.day.slice(0, 7) === month && !elsewhereIds.has(o.id),
  );
}
