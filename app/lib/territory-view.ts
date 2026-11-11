/**
 * Small words of the territory section (11 November 2026).
 */

/** '2026-09-03' as «3 сент. 2026», the year left out when it is this year. */
export function formatDayShort(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
