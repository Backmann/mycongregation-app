/**
 * ONE STOP AT THE END OF A SENTENCE, whatever was put into it (24 November
 * 2026). Sixty-odd translations end a sentence right after a value:
 * «Адрес: {{address}}.», «Время ведёт {{name}}.», «… — {{reason}}.». When the
 * value itself ends with a stop — «Nordstr.», «Иванов И.», a reason typed as
 * a sentence — the reader got «Nordstr..»; after a question, «вера?.».
 *
 * Applied to every translated string (lib/i18n.ts, postProcess). The
 * translations themselves never hold these sequences
 * (scripts/check-punctuation.mjs), so only what a value brought is touched.
 * An ellipsis «...» is left alone.
 */
export function tidyPunctuation(s: string): string {
  return s
    .replace(/([^.])\.\.(?!\.)/g, '$1.')
    .replace(/([?!…])\.(?=\s|$)/g, '$1');
}

/** As an i18next post-processor. */
export const punctuationProcessor = {
  type: 'postProcessor' as const,
  name: 'punctuation',
  process: (value: unknown) => (typeof value === 'string' ? tidyPunctuation(value) : value),
};
