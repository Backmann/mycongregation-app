/** Returns Monday 00:00 of the ISO week containing the given date (local time). */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
/** Format a Date as 'YYYY-MM-DD' in local time (no timezone shift). */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
/** Parse 'YYYY-MM-DD' as local midnight (no timezone shift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * 7);
}
const FALLBACK_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
/**
 * Locale-aware week range formatter using Intl.DateTimeFormat.formatRange.
 * Examples:
 *   en: "May 4 – 10" (same month) / "Apr 27 – May 3" (cross-month)
 *   ru: "4 – 10 мая" / "27 апр. – 3 мая"
 *   de: "4. – 10. Mai" / "27. Apr. – 3. Mai"
 * Year suffix appears only when the range falls outside the current year.
 */
export function formatWeekRange(monday: Date, locale: string = 'en'): string {
  const sunday = addDays(monday, 6);
  const currentYear = new Date().getFullYear();
  const showYear =
    monday.getFullYear() !== currentYear ||
    sunday.getFullYear() !== currentYear;
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(showYear && { year: 'numeric' as const }),
  };
  try {
    const formatter = new Intl.DateTimeFormat(locale, options);
    if (typeof (formatter as any).formatRange === 'function') {
      return (formatter as any).formatRange(monday, sunday);
    }
    return `${formatter.format(monday)} – ${formatter.format(sunday)}`;
  } catch {
    const m1 = FALLBACK_MONTHS[monday.getMonth()];
    const m2 = FALLBACK_MONTHS[sunday.getMonth()];
    const yearSuffix = showYear ? `, ${monday.getFullYear()}` : '';
    if (m1 === m2) {
      return `${m1} ${monday.getDate()} – ${sunday.getDate()}${yearSuffix}`;
    }
    return `${m1} ${monday.getDate()} – ${m2} ${sunday.getDate()}${yearSuffix}`;
  }
}
export function isSameWeek(a: Date, b: Date): boolean {
  return formatDateISO(startOfWeekMonday(a)) === formatDateISO(startOfWeekMonday(b));
}
