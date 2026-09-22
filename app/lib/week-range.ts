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
  return `${fmt.format(monday)} — ${fmt.format(sunday)}`;
}
