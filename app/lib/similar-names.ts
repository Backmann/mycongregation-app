/**
 * «Возможно, один брат» — two names that are likely the same man
 * (5 October 2026).
 *
 * The directory of visiting speakers is filled by hand and from the
 * programme, in two alphabets: «Иван Ротарь», «Ротарь Иван», «Iwan Rotar»
 * are three cards to the app and one brother to the coordinator — and his
 * visits are split between them exactly where they are needed, when deciding
 * whom to invite. The old warning compared the full name letter for letter
 * and caught none of these.
 *
 * The rule here is deliberately rough: every word of a name is reduced to a
 * KEY that survives the usual spellings — word order, case, ё/е, and Latin
 * written the German or the English way (w/v, sch/sh/ш, j/y/й, ie/i, eu/ой,
 * ei/ай, doubled letters, a silent h, -er/-р). Two names match when their
 * words match as a set.
 *
 * It only ever SUGGESTS. Namesakes are ordinary, the rule sometimes pairs
 * them and sometimes misses a double (Heinrich / Генрих) — so nothing is
 * merged by it, and a pair answered «это разные братья» is not offered again.
 *
 * Pure, so scripts/check-similar-names.mjs runs it.
 */

/** Cyrillic to the Latin the key is built in. Upper case marks a sound class. */
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'e', э: 'e',
  ж: 'S', з: 's', и: 'i', і: 'i', ї: 'i', й: 'i', ы: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 's',
  ч: 'S', ш: 'S', щ: 'S', ъ: '', ь: '', ю: 'u', я: 'a',
};

/**
 * The key of one word. `C` in it stands for a Latin «ch», which is ч in an
 * English spelling and х in a German one — `variants` opens it both ways.
 */
function wordKey(word: string): string {
  let s = word
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'e')
    .replace(/ö/g, 'e')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  s = [...s].map((ch) => (ch in CYR ? CYR[ch] : ch)).join('');
  s = s.replace(/[^a-zSC]/g, '');
  s = s
    // ш, ч, ж and their Latin spellings are one class; «ch» stays open.
    .replace(/tsch|tch|sch|sh|zh/g, 'S')
    .replace(/kh/g, 'h')
    .replace(/ch/g, 'C')
    .replace(/ck/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/x/g, 'ks')
    .replace(/ts|tz|z/g, 's')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/w/g, 'v')
    // ё written out: Fjodor, Pjotr.
    .replace(/[jy]o/g, 'e')
    .replace(/[jy]/g, 'i')
    // ю, я written out: «iu», «ia» (after j/y became i).
    .replace(/i([ua])/g, '$1')
    .replace(/eu/g, 'oi')
    .replace(/ei/g, 'ai')
    .replace(/ie/g, 'i')
    // Doubled letters: Bergmann, Деккер, Василий.
    .replace(/([a-zSC])\1+/g, '$1');
  return s;
}

/** The last step, taken after «ch» has been opened either way. */
function finish(key: string): string {
  return (
    key
      // A silent h: Kuhn / Кун, Chumnih / Чумных, Tschumnych.
      .replace(/([aeiou])h(?![aeiou])/g, '$1')
      // Alexander / Александр, Peter / Пётр.
      .replace(/([^aeiou])er$/, '$1r')
  );
}

function variants(key: string): string[] {
  if (!key.includes('C')) return [finish(key)];
  let out = [''];
  for (const ch of key) {
    out = ch === 'C' ? out.flatMap((p) => [p + 'S', p + 'h']) : out.map((p) => p + ch);
  }
  return out.slice(0, 16).map(finish);
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const vb = new Set(variants(b));
  return variants(a).some((v) => vb.has(v));
}

/** The keys of a full name's words, however it is split into fields. */
export function nameKeys(fullName: string): string[] {
  return fullName
    .split(/[\s,.\-]+/)
    .map(wordKey)
    .filter((k) => k.length > 0);
}

/**
 * Whether two full names are likely one man: the same words, in any order.
 * A single word («Иван») is not enough to say so.
 */
export function likelySameName(a: string, b: string): boolean {
  const ka = nameKeys(a);
  const kb = nameKeys(b);
  if (ka.length < 2 || ka.length !== kb.length) return false;
  const left = [...kb];
  for (const w of ka) {
    const i = left.findIndex((x) => sameWord(w, x));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

export interface NamedCard {
  id: string;
  fullName: string;
}

/** The key under which a pair answered «разные братья» is remembered. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Every pair of cards that looks like one man and has not been answered
 * «это разные братья», in the order of the list.
 */
export function likelyDoubles<T extends NamedCard>(
  cards: T[],
  distinct: [string, string][],
): [T, T][] {
  const no = new Set(distinct.map(([a, b]) => pairKey(a, b)));
  const keyed = cards.map((c) => ({ c, n: nameKeys(c.fullName).length }));
  const out: [T, T][] = [];
  for (let i = 0; i < keyed.length; i++) {
    if (keyed[i].n < 2) continue;
    for (let j = i + 1; j < keyed.length; j++) {
      if (keyed[j].n !== keyed[i].n) continue;
      if (no.has(pairKey(keyed[i].c.id, keyed[j].c.id))) continue;
      if (likelySameName(keyed[i].c.fullName, keyed[j].c.fullName)) {
        out.push([keyed[i].c, keyed[j].c]);
      }
    }
  }
  return out;
}
