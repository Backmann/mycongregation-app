import { addDays } from './dates';

/**
 * A week as the language writes it: «21–27 сентября», «September 21 – 27»,
 * «21.–27. September» — the month once within a month, both across two.
 *
 * The order of day and month belongs to the language, so it is left to
 * Intl.DateTimeFormat.formatRange rather than assembled by hand (assembled,
 * German lost the dot after the first day and English put the month last).
 * Where the engine has no formatRange — Hermes on a phone may not — both dates
 * are written in full: longer, never wrong.
 */
export function formatWeekRange(monday: Date, lang: string): string {
  const sunday = addDays(monday, 6);
  const fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' });
  const withRange = fmt as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };
  if (typeof withRange.formatRange === 'function') return withRange.formatRange(monday, sunday);
  // Hermes on the phone has no formatRange (28 September: «5 октября — 11
  // октября»). Within one month the language's own date for the Sunday is
  // kept, and only its day becomes the span: «5–11 октября», «October 5–11»,
  // «5.–11. Oktober». Across two months both dates stay in full.
  if (monday.getMonth() === sunday.getMonth() && typeof fmt.formatToParts === 'function') {
    const parts = fmt.formatToParts(sunday);
    const day = parts.find((p) => p.type === 'day');
    if (day) {
      const dotted = parts[parts.indexOf(day) + 1]?.value.startsWith('.');
      const from = `${monday.getDate()}${dotted ? '.' : ''}`;
      return parts.map((p) => (p === day ? `${from}–${p.value}` : p.value)).join('');
    }
  }
  return `${fmt.format(monday)} — ${fmt.format(sunday)}`;
}
