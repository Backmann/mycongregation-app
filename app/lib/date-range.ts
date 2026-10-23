/**
 * A SPAN OF DAYS, AS THE LANGUAGE WRITES IT (23 October 2026).
 *
 * The walk in German and English found a dozen places that glued a span
 * together by hand — «${day}–${dayMonth}» — and every language broke it its
 * own way: «8–December 13», «20–22. November», «26–1. Nov.», «23. – 28.
 * November», «November 4 – November 4, 2026». The order of day and month, the
 * dot after a German day, the month said once within a month and twice across
 * two — all of that belongs to the language, and Intl.DateTimeFormat knows it
 * (formatRange). Every span on a screen or a sheet goes through here.
 *
 * Where the engine has no formatRange (Hermes on a phone may not), both dates
 * are written in full with a dash: longer, never wrong. One day is one date.
 */

export interface DayRangeOptions {
  /** 'long' — «November», 'short' — «Nov.». Default long. */
  month?: 'long' | 'short';
  /** Weekday before each day: 'long' — «Dienstag», 'short' — «Di.». */
  weekday?: 'long' | 'short';
  /** Always, never, or only when not this year (default). */
  year?: 'always' | 'never' | 'auto';
}

/** «2026-11-20» → local midnight of that day. */
function day(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function intlLang(lang: string): string {
  // American English, decided 23 October 2026: «October 17».
  const l = (lang || 'ru').slice(0, 2).toLowerCase();
  return l === 'en' ? 'en-US' : l;
}

export function formatDayRange(
  fromISO: string,
  toISO: string | null | undefined,
  lang: string,
  opts: DayRangeOptions = {},
): string {
  const from = day(fromISO);
  const to = toISO ? day(toISO) : from;
  const thisYear = new Date().getFullYear();
  const showYear =
    opts.year === 'always' ||
    (opts.year !== 'never' &&
      (from.getFullYear() !== thisYear || to.getFullYear() !== thisYear));
  const fmt = new Intl.DateTimeFormat(intlLang(lang), {
    day: 'numeric',
    month: opts.month ?? 'long',
    ...(opts.weekday ? { weekday: opts.weekday } : {}),
    ...(showYear ? { year: 'numeric' as const } : {}),
  });
  if (+from === +to) return fmt.format(from);
  const ranged = fmt as Intl.DateTimeFormat & {
    formatRange?: (a: Date, b: Date) => string;
  };
  if (typeof ranged.formatRange === 'function') {
    return ranged.formatRange(from, to);
  }
  return `${fmt.format(from)} – ${fmt.format(to)}`;
}

/** One day, the same way: «20. November», «November 20», «20 ноября». */
export function formatDay(
  iso: string,
  lang: string,
  opts: Omit<DayRangeOptions, 'year'> & { year?: 'always' | 'never' | 'auto' } = {},
): string {
  return formatDayRange(iso, iso, lang, opts);
}
