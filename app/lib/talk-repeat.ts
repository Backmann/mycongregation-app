/**
 * THE SAME TALK NOT AGAIN WITHIN THREE YEARS (Lionel, 23 October 2026).
 *
 * The congregation should not hear one outline twice in three years. Until
 * now the pickers warned at 3 and 6 months — a talk heard a year ago passed
 * in silence. The rule is judged around the meeting the talk is chosen FOR,
 * not around today: a talk planned for next spring and chosen again for
 * the winter after is just as much a repeat as one heard last month.
 */

export const REPEAT_YEARS = 3;

/** Whole days between two YYYY-MM-DD dates, either order. */
function daysApart(a: string, b: string): number {
  const ms =
    Date.parse(`${a.slice(0, 10)}T00:00:00Z`) -
    Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** Less than three years apart, and not the same week (that is the talk itself). */
export function tooClose(a: string, b: string): boolean {
  const d = daysApart(a, b);
  return d >= 7 && d < REPEAT_YEARS * 365 + 1;
}

/**
 * The hearing nearest to `forDate` that breaks the rule, or null.
 *
 * `dates` are the days the talk was or will be heard here — from the journal
 * and from the programme (which knows the years before the journal).
 */
export function repeatOf(
  dates: (string | null | undefined)[],
  forDate: string,
): string | null {
  let best: string | null = null;
  let bestGap = Infinity;
  for (const d of dates) {
    if (!d || !tooClose(d, forDate)) continue;
    const gap = daysApart(d, forDate);
    if (gap < bestGap) {
      best = d.slice(0, 10);
      bestGap = gap;
    }
  }
  return best;
}

/** «4 мес.», «1 г. 2 мес.» — how far apart, for the hint. */
export function monthsApart(a: string, b: string): number {
  return Math.max(0, Math.round(daysApart(a, b) / 30.44));
}
