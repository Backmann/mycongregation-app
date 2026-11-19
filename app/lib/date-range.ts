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
  // Hermes on a phone has no formatRange (Lionel's phone, 19 November 2026:
  // «7 декабря - 13 декабря»). Within one month the language's own date of
  // the last day is kept and only its day becomes the span — «7–13 декабря»,
  // «December 7–13», «7.–13. Dezember», as lib/week-range.ts does for weeks.
  if (
    !opts.weekday &&
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth()
  ) {
    const joined = joinDays([from.getDate()], to, fmt, '–');
    if (joined) return joined;
  }
  // Across months: the first date says its year only where it differs from
  // this one — «28 декабря – 3 января 2027 г.», not the year twice.
  const first =
    showYear && from.getFullYear() === thisYear && to.getFullYear() !== thisYear
      ? new Intl.DateTimeFormat(intlLang(lang), {
          day: 'numeric',
          month: opts.month ?? 'long',
          ...(opts.weekday ? { weekday: opts.weekday } : {}),
        }).format(from)
      : fmt.format(from);
  return `${first} – ${fmt.format(to)}`;
}

/**
 * The last date written by the language, its day replaced by «a, b<sep>c»:
 * the order of day and month, and German's dot, stay the language's own.
 * Null where the engine cannot say the parts of a date.
 */
function joinDays(
  earlier: number[],
  last: Date,
  fmt: Intl.DateTimeFormat,
  sep: string,
): string | null {
  if (typeof fmt.formatToParts !== 'function') return null;
  const parts = fmt.formatToParts(last);
  const dayPart = parts.find((p) => p.type === 'day');
  if (!dayPart) return null;
  const dotted = parts[parts.indexOf(dayPart) + 1]?.value.startsWith('.');
  const d = (n: number) => `${n}${dotted ? '.' : ''}`;
  const head = earlier.map(d).join(', ');
  return parts
    .map((p) => (p === dayPart ? `${head}${sep}${p.value}` : p.value))
    .join('');
}

/**
 * Several single days: «23, 25, 27 ноября», «November 23, 25, 27»,
 * «23., 25., 27. November»; days of different months each in full. For the
 * days a brother serves at the pioneer school (19 November 2026).
 */
export function formatDayList(isos: string[], lang: string): string {
  const days = [...new Set(isos)].sort().map(day);
  if (days.length === 0) return '';
  const thisYear = new Date().getFullYear();
  const last = days[days.length - 1];
  const fmt = new Intl.DateTimeFormat(intlLang(lang), {
    day: 'numeric',
    month: 'long',
    ...(last.getFullYear() !== thisYear ? { year: 'numeric' as const } : {}),
  });
  if (days.length === 1) return fmt.format(last);
  const oneMonth = days.every(
    (x) => x.getMonth() === last.getMonth() && x.getFullYear() === last.getFullYear(),
  );
  if (oneMonth) {
    const joined = joinDays(
      days.slice(0, -1).map((x) => x.getDate()),
      last,
      fmt,
      ', ',
    );
    if (joined) return joined;
  }
  return days.map((x) => fmt.format(x)).join(', ');
}

/** One day, the same way: «20. November», «November 20», «20 ноября». */
export function formatDay(
  iso: string,
  lang: string,
  opts: Omit<DayRangeOptions, 'year'> & { year?: 'always' | 'never' | 'auto' } = {},
): string {
  return formatDayRange(iso, iso, lang, opts);
}
