/**
 * The placeholders of the announcement templates (R-09 step 4), as the
 * reader writes them.
 *
 * The server keeps one spelling — {when}, {from}… — whatever the language; a
 * coordinator writes them in his own language. The names live in the locales
 * (`announcements.templates.token.*`); these helpers turn one spelling into
 * the other on the way in and out, so the words he sees are in his language
 * and the server never stores a token it does not know.
 */
export const TOKENS = [
  'when',
  'place',
  'from',
  'to',
  'midweek',
  'name',
  'dates',
  'month',
  'report',
  'months',
  'program',
] as const;
export type Token = (typeof TOKENS)[number];

/** The reader's name of a token, without braces. */
export type TokenName = (token: Token) => string;

/** The same rule as the server: anything between braces on one line. */
const PLACEHOLDER = /\{([^{}\n]*)\}/g;

const isToken = (t: string): t is Token => (TOKENS as readonly string[]).includes(t);

/** {when} → the reader's name. */
export function toLocalTokens(words: string, name: TokenName): string {
  return words.replace(PLACEHOLDER, (all, t: string) => (isToken(t) ? `{${name(t)}}` : all));
}

/** The reader's name → {when}; an unknown one is left for the server to refuse. */
export function fromLocalTokens(words: string, name: TokenName): string {
  const back = new Map(TOKENS.map((k) => [name(k), k] as const));
  return words.replace(PLACEHOLDER, (all, t: string) => {
    const k = back.get(t);
    return k ? `{${k}}` : all;
  });
}

/** The preview: each known token with an example value, the rest as written. */
export function sampleFill(words: string, sample: (token: Token) => string): string {
  return words.replace(PLACEHOLDER, (all, t: string, at: number, text: string) => {
    if (!isToken(t)) return all;
    const v = sample(t);
    // As the server fills: a value that starts a line starts a sentence.
    return /(^|\n)[ \t]*$/.test(text.slice(0, at)) ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  });
}
