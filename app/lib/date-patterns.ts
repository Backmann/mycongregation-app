/**
 * DATE PATTERNS ARE WRITTEN IN RUSSIAN ORDER; this makes them right in every
 * language (16 October 2026).
 *
 * Screens build their dates with dayjs patterns such as 'D MMMM' or
 * 'dd, D MMMM'. Those patterns were written for Russian, and in Russian they
 * are right («17 октября», «сб, 17 октября»). In German the same pattern said
 * «17 Oktober» and «Sa, 17 Oktober» — German writes the day with a dot
 * («17. Oktober», «Sa., 17. Oktober») — and in English «Sa, 17 October»,
 * because dayjs' two-letter weekday is meant for calendar headers («Sat,
 * 17 October» is how it is written). Found on the stand in de/en, about sixty
 * patterns across the screens.
 *
 * Rather than a second pattern per language at every one of those places,
 * lib/dayjs-locales.ts runs every pattern through `localizePattern` before
 * dayjs formats it, for the locale of that very date. Only patterns that put
 * a day number before a month are touched; 'MMMM YYYY', 'DD.MM', 'HH:mm' and
 * a weekday on its own ('dd' over a calendar column) are left as they are.
 * A pattern with literal text in [brackets] is left alone too.
 *
 * Pinned by scripts/check-date-patterns.mjs. Pure: no imports.
 */

/** The pattern as the language writes it. Russian (and anything unknown) keeps it. */
export function localizePattern(pattern: string, lang: string): string {
  const l = (lang || '').slice(0, 2).toLowerCase();
  if ((l !== 'de' && l !== 'en') || pattern.includes('[')) return pattern;
  // Only a day number followed by a month: «D MMMM», «D MMM».
  if (!/(^|[^D])D M/.test(pattern)) return pattern;

  // A short weekday right before the day number: «dd, D …» / «dd D …».
  const weekday = /(^|[^d])dd(?!d),?\s+(?=D)/;
  if (l === 'de') {
    return pattern.replace(weekday, '$1dd., ').replace(/(^|[^D])D(?!D) (?=M)/g, '$1D. ');
  }
  return pattern.replace(weekday, '$1ddd, ');
}

/**
 * The first day of a range within one month, on its own: «16–22 ноября»,
 * «16.–22. November», «16–22 November». German writes this day with its dot
 * too; `localizePattern` cannot know a lone 'D' is half of a range.
 */
export function rangeStartPattern(lang: string): string {
  return (lang || '').slice(0, 2).toLowerCase() === 'de' ? 'D.' : 'D';
}
