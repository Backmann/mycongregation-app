/**
 * Service years run 1 September to 31 August and are named by the year they
 * end in. The territory records (S-13) are kept for the current and the
 * previous service year only — the server's territories/service-year.ts says
 * the same and decides; this copy only lets a screen say it in advance.
 */

export function serviceYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 9 ? year + 1 : year;
}

/** The first day whose records are still kept, seen from `today`. */
export function keptFrom(today: string): string {
  return `${serviceYearOf(today) - 2}-09-01`;
}
