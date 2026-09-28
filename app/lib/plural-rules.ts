/**
 * Plural rules for the phone (28 September).
 *
 * i18next picks «1 возвещатель / 2 возвещателя / 5 возвещателей» by asking
 * `Intl.PluralRules`. Hermes — the engine the Android app runs on — has
 * `Intl` but not `PluralRules`, and i18next then falls back, without a word,
 * to «one or other»: the phone said «86 возвещателя», «5 группы», «48 часа»
 * while the browser, which has the rules, said it right.
 *
 * A polyfill package would change package.json, and package.json is part of
 * the app's fingerprint — the installed build would stop taking updates. So
 * the rules are written here, for the three languages the app speaks, from
 * the Unicode CLDR tables, and installed only where the engine lacks its own.
 *
 * What i18next reads: `new Intl.PluralRules(lng, { type })`, `.select(n)`
 * and `.resolvedOptions().pluralCategories`.
 */

type Category = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** CLDR cardinal rules. `n` is the absolute value; `i`/`v` as in CLDR. */
function cardinal(lang: string, n: number): Category {
  const abs = Math.abs(n);
  const isInt = Number.isInteger(abs);
  if (lang === 'ru') {
    // one: v = 0 and i % 10 = 1 and i % 100 != 11
    // few: v = 0 and i % 10 = 2..4 and i % 100 != 12..14
    // many: v = 0 and (i % 10 = 0 or 5..9 or i % 100 = 11..14)
    // other: fractions
    if (!isInt) return 'other';
    const m10 = abs % 10;
    const m100 = abs % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 'few';
    return 'many';
  }
  // en, de: one: i = 1 and v = 0
  return isInt && abs === 1 ? 'one' : 'other';
}

function ordinal(lang: string, n: number): Category {
  if (lang === 'en') {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 === 2 && m100 !== 12) return 'two';
    if (m10 === 3 && m100 !== 13) return 'few';
    return 'other';
  }
  return 'other';
}

const CATEGORIES: Record<string, { cardinal: Category[]; ordinal: Category[] }> = {
  ru: { cardinal: ['one', 'few', 'many', 'other'], ordinal: ['other'] },
  en: { cardinal: ['one', 'other'], ordinal: ['one', 'two', 'few', 'other'] },
  de: { cardinal: ['one', 'other'], ordinal: ['other'] },
};

export class SimplePluralRules {
  private readonly lang: string;
  private readonly type: 'cardinal' | 'ordinal';
  constructor(locale?: string | string[], options?: { type?: 'cardinal' | 'ordinal' }) {
    const first = (Array.isArray(locale) ? locale[0] : locale) ?? 'en';
    const lang = String(first).toLowerCase().split(/[-_]/)[0];
    this.lang = lang in CATEGORIES ? lang : 'en';
    this.type = options?.type === 'ordinal' ? 'ordinal' : 'cardinal';
  }
  select(n: number): Category {
    const v = Number(n);
    return this.type === 'ordinal' ? ordinal(this.lang, v) : cardinal(this.lang, v);
  }
  resolvedOptions() {
    return {
      locale: this.lang,
      type: this.type,
      pluralCategories: [...CATEGORIES[this.lang][this.type]],
    };
  }
  static supportedLocalesOf(locales: string | string[]) {
    return (Array.isArray(locales) ? locales : [locales]).filter((l) =>
      String(l).toLowerCase().split(/[-_]/)[0] in CATEGORIES,
    );
  }
}

/** Whether the engine's own rules answer Russian correctly. */
function nativeWorks(): boolean {
  try {
    const PR = (globalThis as { Intl?: { PluralRules?: unknown } }).Intl?.PluralRules as
      | (new (l: string) => { select(n: number): string })
      | undefined;
    if (typeof PR !== 'function') return false;
    const r = new PR('ru');
    return r.select(5) === 'many' && r.select(2) === 'few' && r.select(21) === 'one';
  } catch {
    return false;
  }
}

/** Put the rules in place where the engine has none. Returns whether it did. */
export function installPluralRules(): boolean {
  if (nativeWorks()) return false;
  const g = globalThis as { Intl?: Record<string, unknown> };
  if (!g.Intl) g.Intl = {};
  g.Intl.PluralRules = SimplePluralRules as unknown;
  return true;
}
