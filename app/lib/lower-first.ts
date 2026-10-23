/**
 * A word moved into the middle of a sentence loses its capital — in Russian
 * and English. Not in German: there every noun keeps it, and «anfangsgebet»,
 * «zusammenkunft unter der Woche», «Oktober – november» are spelling mistakes
 * (walk in German, 23 October 2026). One rule, in one place.
 */
function keepsCapitals(lang: string): boolean {
  return (lang || '').slice(0, 2).toLowerCase() === 'de';
}

/** The first letter made small — unless the language keeps it. */
export function lowerFirst(text: string, lang: string): string {
  if (!text || keepsCapitals(lang)) return text;
  return text.charAt(0).toLocaleLowerCase(lang) + text.slice(1);
}

/** The whole phrase made small — unless the language keeps its capitals. */
export function lowerAll(text: string, lang: string): string {
  if (!text || keepsCapitals(lang)) return text;
  return text.toLocaleLowerCase(lang);
}

/**
 * A month's or weekday's name inside a sentence: small in Russian only —
 * English writes «November» and German «November» wherever they stand
 * («October – november 2026» on the printed sheet, 23 October 2026).
 */
export function lowerMonth(text: string, lang: string): string {
  if (!text || (lang || '').slice(0, 2).toLowerCase() !== 'ru') return text;
  return text.toLocaleLowerCase(lang);
}
