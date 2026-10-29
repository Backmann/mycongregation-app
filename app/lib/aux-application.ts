/**
 * Small words shared by the application's screens (29 October 2026).
 *
 * The months of an application are «YYYY-MM»; a month is said the reader's
 * way, «ноябрь 2026», and a list of them run by run — «ноябрь–декабрь 2026,
 * март 2027» — because that is how a person reads «which months».
 */

export function monthName(ym: string, lang: string, withYear = true): string {
  const d = new Date(`${ym}-15T12:00:00Z`);
  return d.toLocaleDateString(lang, {
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Months grouped by their year, in order: the tiles are laid out a year at a time. */
export function byYear(months: string[]): { year: string; months: string[] }[] {
  const out: { year: string; months: string[] }[] = [];
  for (const m of months) {
    const y = m.slice(0, 4);
    const last = out[out.length - 1];
    if (last && last.year === y) last.months.push(m);
    else out.push({ year: y, months: [m] });
  }
  return out;
}

/** «YYYY-MM» plus n months. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Months one after another, as runs. */
export function runsOf(months: string[]): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (const m of [...new Set(months)].sort()) {
    const last = out[out.length - 1];
    if (last && addMonths(last.end, 1) === m) last.end = m;
    else out.push({ start: m, end: m });
  }
  return out;
}

/** «ноябрь–декабрь 2026, март 2027». */
export function monthsLabel(months: string[], lang: string): string {
  return runsOf(months)
    .map((r) => {
      if (r.start === r.end) return monthName(r.start, lang);
      const sameYear = r.start.slice(0, 4) === r.end.slice(0, 4);
      return `${monthName(r.start, lang, !sameYear)}–${monthName(r.end, lang)}`;
    })
    .join(', ');
}

/** Each month with its goal: «ноябрь 2026 · 30 ч». */
export function monthGoals(
  months: string[],
  reduced: string[],
  lang: string,
): { month: string; label: string; hours: 15 | 30 }[] {
  return [...months].sort().map((m) => ({
    month: m,
    label: capitalize(monthName(m, lang)),
    hours: reduced.includes(m) ? 15 : 30,
  }));
}
