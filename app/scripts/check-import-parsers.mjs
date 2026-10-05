#!/usr/bin/env node
/**
 * The programme importers, checked where they actually run (5 October 2026).
 *
 * Since 12 June the workbook and the Watchtower are read in the browser, by
 * lib/mwb-parser.ts and lib/wt-parser.ts: the publication file never leaves
 * the administrator's device. The copies on the server (mwb-import, wt-import)
 * stopped being called that day — and went on being the only ones with tests.
 * The 71 cases below guarded code nobody runs; the code every meeting's
 * programme comes from had none.
 *
 * They are those same cases, moved here by a script and not retyped: the
 * server's four spec files, with the types taken off. On the day they were
 * moved, both copies passed all 71 — so nothing was found broken, and from
 * now on a change to the live parser is checked before it reaches a phone.
 *
 * WHAT THIS DOES NOT COVER, and it is the larger half: reading the document
 * itself — which heading opens a section, which paragraph is a part. Neither
 * copy ever had a test for that. It needs a real issue to be built against;
 * until then a change in the publication's layout is still found by the
 * person importing it.
 *
 * Called directly from the gate — no test runner in the app, and a new npm
 * script would move the Expo fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'import-parsers-'));

/** The parser as the app ships it, made loadable outside the bundler. */
async function load(name) {
  const js = ts
    .transpileModule(readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    })
    // The one runtime import; the zip is not opened by these cases.
    .outputText.replace(/from ['"]jszip['"]/, `from ${JSON.stringify(pathToFileURL(require.resolve('jszip')).href)}`);
  const file = join(out, `${name}.mjs`);
  writeFileSync(file, js);
  return import(pathToFileURL(file));
}
const MODULES = { mwb: await load('mwb-parser'), wt: await load('wt-parser') };

// ───── just enough of a test runner for the cases below ─────
const path = [];
let passed = 0;
const failures = [];
function describe(name, fn) {
  path.push(name);
  fn();
  path.pop();
}
function it(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${[...path, name].join(' › ')}\n    ${e.message}`);
  }
}
/** As the server's runner compared: a key holding `undefined` is no key. */
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const show = (v) => JSON.stringify(v);
function expect(got) {
  return {
    toBe(want) {
      if (!Object.is(got, want)) throw new Error(`ждали ${show(want)}, вышло ${show(got)}`);
    },
    toBeNull() {
      if (got !== null) throw new Error(`ждали null, вышло ${show(got)}`);
    },
    toEqual(want) {
      if (!isDeepStrictEqual(plain(got), plain(want))) throw new Error(`ждали ${show(want)}, вышло ${show(got)}`);
    },
  };
}
const SUITES = [];

// ───── mwb-parser.spec.ts (was server/src/mwb-import/mwb-parser.spec.ts) ─────
function mwb_parser_spec_ts({ extractYearFromFilename, extractPartTitle, parseWeekRange, extractDuration, extractNumber }) {
  function makePart(overrides = {}) {
      return {
          rawTitle: null,
          rawNumber: null,
          rawSection: 'treasures',
          durationMin: null,
          durationRawText: null,
          notes: [],
          partKey: 'unknown',
          partOrder: 0,
          classifierConfidence: 'unknown',
          ...overrides,
      };
  }
  describe('mwb-parser', () => {
      describe('extractYearFromFilename', () => {
          it('extracts year from standard MWB filename', () => {
              expect(extractYearFromFilename('mwb_U_202605.epub')).toBe(2026);
          });
          it('extracts year from Watchtower filename', () => {
              expect(extractYearFromFilename('w_U_202603.epub')).toBe(2026);
          });
          it('extracts year from December issue', () => {
              expect(extractYearFromFilename('mwb_E_202512.epub')).toBe(2025);
          });
          it('handles uppercase .EPUB extension', () => {
              expect(extractYearFromFilename('mwb_U_202605.EPUB')).toBe(2026);
          });
          it('handles full path, not just basename', () => {
              expect(extractYearFromFilename('/home/user/Downloads/mwb_U_202605.epub')).toBe(2026);
          });
          it('falls back to current year when no pattern matches', () => {
              expect(extractYearFromFilename('random-name.epub')).toBe(new Date().getFullYear());
          });
      });
      describe('parseWeekRange', () => {
          it('parses same-month range', () => {
              expect(parseWeekRange('11-17 мая', 2026)).toEqual({
                  start: '2026-05-11',
                  end: '2026-05-17',
              });
          });
          it('parses cross-month range', () => {
              expect(parseWeekRange('29 июня - 5 июля', 2026)).toEqual({
                  start: '2026-06-29',
                  end: '2026-07-05',
              });
          });
          it('handles year crossover (Dec → Jan)', () => {
              expect(parseWeekRange('29 декабря - 4 января', 2025)).toEqual({
                  start: '2025-12-29',
                  end: '2026-01-04',
              });
          });
          it('normalizes em-dash to hyphen', () => {
              expect(parseWeekRange('11—17 мая', 2026)).toEqual({
                  start: '2026-05-11',
                  end: '2026-05-17',
              });
          });
          it('normalizes en-dash to hyphen', () => {
              expect(parseWeekRange('11–17 мая', 2026)).toEqual({
                  start: '2026-05-11',
                  end: '2026-05-17',
              });
          });
          it('returns null for unparseable text', () => {
              expect(parseWeekRange('not a date', 2026)).toBeNull();
          });
          it('returns null for empty string', () => {
              expect(parseWeekRange('', 2026)).toBeNull();
          });
          it('returns null for invalid month name', () => {
              expect(parseWeekRange('11-17 fakemonth', 2026)).toBeNull();
          });
      });
      describe('extractDuration', () => {
          it('extracts duration with parentheses', () => {
              const result = extractDuration('(4 мин.)');
              expect(result.min).toBe(4);
              expect(result.raw).toBe('(4 мин');
          });
          it('extracts two-digit duration', () => {
              expect(extractDuration('(10 мин.)').min).toBe(10);
          });
          it('extracts duration from text with prefix', () => {
              expect(extractDuration('5. Чтение (3 мин)').min).toBe(3);
          });
          it('extracts duration without parentheses (fallback)', () => {
              expect(extractDuration('Длительность 30 мин всего').min).toBe(30);
          });
          it('returns null for text without duration', () => {
              const result = extractDuration('просто текст без минут');
              expect(result.min).toBeNull();
              expect(result.raw).toBeNull();
          });
          it('returns null for empty string', () => {
              expect(extractDuration('').min).toBeNull();
          });
      });
      describe('extractNumber', () => {
          it('extracts single-digit number', () => {
              expect(extractNumber('5. Чтение Библии')).toBe(5);
          });
          it('extracts two-digit number', () => {
              expect(extractNumber('15. CBS')).toBe(15);
          });
          it('handles leading whitespace', () => {
              expect(extractNumber('  3. With leading space')).toBe(3);
          });
          it('returns null when no number prefix', () => {
              expect(extractNumber('Без префикса')).toBeNull();
          });
          it('returns null without space after dot', () => {
              expect(extractNumber('5.NoSpaceAfter')).toBeNull();
          });
          it('returns null without dot', () => {
              expect(extractNumber('5 без точки')).toBeNull();
          });
          it('returns null for empty string', () => {
              expect(extractNumber('')).toBeNull();
          });
      });
      describe('extractPartTitle', () => {
          it('returns null for synthetic parts (chairman/CBS reader)', () => {
              const part = makePart({ synthetic: true, rawTitle: 'Should be ignored' });
              expect(extractPartTitle(part)).toBeNull();
          });
          it('returns null when rawTitle is null', () => {
              const part = makePart({ rawTitle: null });
              expect(extractPartTitle(part)).toBeNull();
          });
          it('strips numeric prefix like "5. "', () => {
              const part = makePart({ rawTitle: '5. Чтение Библии' });
              expect(extractPartTitle(part)).toBe('Чтение Библии');
          });
          it('strips trailing duration like "(4 мин.)"', () => {
              const part = makePart({ rawTitle: 'Чтение Библии (4 мин.)' });
              expect(extractPartTitle(part)).toBe('Чтение Библии');
          });
          it('strips both numeric prefix and trailing duration', () => {
              const part = makePart({ rawTitle: '5. Чтение Библии (4 мин.)' });
              expect(extractPartTitle(part)).toBe('Чтение Библии');
          });
          it('appends first content note to title (e.g. scripture reference)', () => {
              const part = makePart({
                  rawTitle: '5. Чтение Библии (4 мин.)',
                  notes: ['Иса 60:1-22'],
              });
              expect(extractPartTitle(part)).toBe('Чтение Библии: Иса 60:1-22');
          });
          it('uses only the first note even when multiple are present', () => {
              const part = makePart({
                  rawTitle: '4. Духовные жемчужины',
                  notes: [
                      'Иса 58:1, 2 — Почему пророк говорит?',
                      'Иса 58:3, 4 — Какой пост приятен?',
                      'Что в чтении Библии на этой неделе поучительно?',
                  ],
              });
              expect(extractPartTitle(part)).toBe('Духовные жемчужины: Иса 58:1, 2 — Почему пророк говорит?');
          });
          it('does not enrich when notes array is empty', () => {
              const part = makePart({
                  rawTitle: '5. Чтение Библии (4 мин.)',
                  notes: [],
              });
              expect(extractPartTitle(part)).toBe('Чтение Библии');
          });
          it('does not enrich when notes[0] is an empty string', () => {
              const part = makePart({
                  rawTitle: '5. Чтение Библии',
                  notes: [''],
              });
              expect(extractPartTitle(part)).toBe('Чтение Библии');
          });
          it('preserves complex titles without prefix or duration', () => {
              const part = makePart({
                  rawTitle: 'Песня 21 и молитва | Вступительные слова',
              });
              expect(extractPartTitle(part)).toBe('Песня 21 и молитва | Вступительные слова');
          });
      });
  });
}
SUITES.push(['mwb', mwb_parser_spec_ts]);

// ───── mwb-parser.new-year-week.spec.ts (was server/src/mwb-import/mwb-parser.new-year-week.spec.ts) ─────
function mwb_parser_new_year_week_spec_ts({ parseWeekRange }) {
  /**
   * The week that crosses into the new year.
   *
   * Every other week in a workbook is written short — «21—27 ДЕКАБРЯ» — and this
   * one is written out in full, with both years and the word «года», because it
   * belongs to two of them. It matched none of the patterns and was dropped in
   * silence: once a year, the last week of December simply failed to import, and
   * the schedule showed an empty week nobody could explain.
   *
   * Found on 22 August 2026 in mwb_U_202611.epub, where week 9 of 9 was missing
   * and the parser reported no error at all.
   */
  describe('parseWeekRange — the new-year week', () => {
      it('reads the full form with both years', () => {
          expect(parseWeekRange('28 ДЕКАБРЯ 2026 ГОДА - 3 ЯНВАРЯ 2027 ГОДА', 2026)).toEqual({ start: '2026-12-28', end: '2027-01-03' });
      });
      it('takes the years from the TEXT, not from the file name', () => {
          // The file is named for 2026; the week ends in 2027, and the publication
          // says so. Believing the file name would put the end date a year out.
          expect(parseWeekRange('28 ДЕКАБРЯ 2026 ГОДА - 3 ЯНВАРЯ 2027 ГОДА', 1999)).toEqual({ start: '2026-12-28', end: '2027-01-03' });
      });
      it('reads it with an em dash, as the publication actually writes it', () => {
          expect(parseWeekRange('28 ДЕКАБРЯ 2026 года — 3 ЯНВАРЯ 2027 года', 2026)).toEqual({ start: '2026-12-28', end: '2027-01-03' });
      });
      it('reads it without the word «года» at all', () => {
          expect(parseWeekRange('28 ДЕКАБРЯ 2026 - 3 ЯНВАРЯ 2027', 2026)).toEqual({
              start: '2026-12-28',
              end: '2027-01-03',
          });
      });
      it('still reads the ordinary forms', () => {
          // The new pattern is tried first, so the two that always worked are
          // asserted here as well: a fix that quietly breaks the common case is
          // worse than the bug it fixes.
          expect(parseWeekRange('21-27 ДЕКАБРЯ', 2026)).toEqual({
              start: '2026-12-21',
              end: '2026-12-27',
          });
          expect(parseWeekRange('30 НОЯБРЯ - 6 ДЕКАБРЯ', 2026)).toEqual({
              start: '2026-11-30',
              end: '2026-12-06',
          });
      });
      it('still turns December into January for the short cross-month form', () => {
          // «28 ДЕКАБРЯ - 3 ЯНВАРЯ» without years: the year has to be inferred, and
          // that inference is the one the new pattern replaces when it can.
          expect(parseWeekRange('28 ДЕКАБРЯ - 3 ЯНВАРЯ', 2026)).toEqual({
              start: '2026-12-28',
              end: '2027-01-03',
          });
      });
      it('answers nothing to a heading that is not a week', () => {
          expect(parseWeekRange('СОДЕРЖАНИЕ', 2026)).toBeNull();
          expect(parseWeekRange('28 ДЕКАБРЯ 2026 ГОДА', 2026)).toBeNull();
      });
  });
}
SUITES.push(['mwb', mwb_parser_new_year_week_spec_ts]);

// ───── wt-parser.spec.ts (was server/src/wt-import/wt-parser.spec.ts) ─────
function wt_parser_spec_ts({ extractYearFromFilename, daysBetween, parseDateRange, extractSongs }) {
  describe('wt-parser', () => {
      describe('extractYearFromFilename', () => {
          it('extracts year from Watchtower study edition filename', () => {
              expect(extractYearFromFilename('w_U_202603.epub')).toBe(2026);
          });
          it('extracts year from Public edition (wp_) filename', () => {
              expect(extractYearFromFilename('wp_E_202509.epub')).toBe(2025);
          });
          it('falls back to current year when pattern does not match', () => {
              expect(extractYearFromFilename('random.epub')).toBe(new Date().getFullYear());
          });
      });
      describe('daysBetween', () => {
          it('returns 0 for same date', () => {
              expect(daysBetween('2026-05-11', '2026-05-11')).toBe(0);
          });
          it('returns 1 for consecutive days', () => {
              expect(daysBetween('2026-05-11', '2026-05-12')).toBe(1);
          });
          it('returns 6 for a typical study-week range (Mon -> Sun)', () => {
              expect(daysBetween('2026-05-11', '2026-05-17')).toBe(6);
          });
          it('handles cross-month boundary', () => {
              expect(daysBetween('2026-05-29', '2026-06-04')).toBe(6);
          });
          it('handles cross-year boundary', () => {
              expect(daysBetween('2025-12-29', '2026-01-04')).toBe(6);
          });
          it('returns negative for reversed range', () => {
              expect(daysBetween('2026-05-17', '2026-05-11')).toBe(-6);
          });
      });
      describe('parseDateRange', () => {
          it('parses same-month uppercase range with year', () => {
              expect(parseDateRange('4-10 МАЯ 2026')).toEqual({
                  start: '2026-05-04',
                  end: '2026-05-10',
                  year: 2026,
              });
          });
          it('parses cross-month range with year', () => {
              expect(parseDateRange('29 ИЮНЯ - 5 ИЮЛЯ 2026')).toEqual({
                  start: '2026-06-29',
                  end: '2026-07-05',
                  year: 2026,
              });
          });
          it('handles year crossover (Dec -> Jan, end year incremented)', () => {
              expect(parseDateRange('28 ДЕКАБРЯ - 3 ЯНВАРЯ 2025')).toEqual({
                  start: '2025-12-28',
                  end: '2026-01-03',
                  year: 2025,
              });
          });
          it('normalizes em-dash to hyphen', () => {
              expect(parseDateRange('4—10 МАЯ 2026')).toEqual({
                  start: '2026-05-04',
                  end: '2026-05-10',
                  year: 2026,
              });
          });
          it('accepts lowercase month names', () => {
              expect(parseDateRange('4-10 мая 2026')).toEqual({
                  start: '2026-05-04',
                  end: '2026-05-10',
                  year: 2026,
              });
          });
          it('returns null for unparseable text', () => {
              expect(parseDateRange('random text 2026')).toBeNull();
          });
          it('returns null without year (mandatory for WT)', () => {
              expect(parseDateRange('4-10 МАЯ')).toBeNull();
          });
          it('returns null for empty string', () => {
              expect(parseDateRange('')).toBeNull();
          });
      });
      describe('extractSongs', () => {
          it('finds multiple song numbers in text', () => {
              expect(extractSongs('Песня 21 в начале и Песня 153 в конце')).toEqual([
                  21, 153,
              ]);
          });
          it('handles uppercase ПЕСНЯ', () => {
              expect(extractSongs('ПЕСНЯ 7')).toEqual([7]);
          });
          it('handles "Песни" (plural form)', () => {
              expect(extractSongs('Песни 1 в начале')).toEqual([1]);
          });
          it('returns empty array when no songs mentioned', () => {
              expect(extractSongs('текст без песен')).toEqual([]);
          });
          it('returns empty array for empty string', () => {
              expect(extractSongs('')).toEqual([]);
          });
          it('filters out zero', () => {
              expect(extractSongs('Песня 0 и Песня 5')).toEqual([5]);
          });
      });
  });
}
SUITES.push(['wt', wt_parser_spec_ts]);

// ───── wt-parser.new-year-week.spec.ts (was server/src/wt-import/wt-parser.new-year-week.spec.ts) ─────
function wt_parser_new_year_week_spec_ts({ parseDateRange }) {
  /**
   * The study article for the week that crosses into the new year.
   *
   * Same fault as the workbook's, in a second copy of the same idea: the article
   * headed «28 ДЕКАБРЯ 2026 ГОДА — 3 ЯНВАРЯ 2027 ГОДА» matched no pattern, was
   * skipped without a word, and the weekend meeting of that week came out empty.
   *
   * Found in w_U_202610.epub, which the parser reported as holding three study
   * articles when it holds four.
   */
  describe('parseDateRange — the new-year week', () => {
      it('reads the full form with both years', () => {
          expect(parseDateRange('28 ДЕКАБРЯ 2026 ГОДА — 3 ЯНВАРЯ 2027 ГОДА')).toEqual({ start: '2026-12-28', end: '2027-01-03', year: 2026 });
      });
      it('reports the year the week BEGINS in', () => {
          // The issue belongs to the year it starts in; a study article that ends in
          // January is still part of the December programme.
          expect(parseDateRange('28 ДЕКАБРЯ 2026 года - 3 ЯНВАРЯ 2027 года')?.year).toBe(2026);
      });
      it('still reads the two forms that always worked', () => {
          expect(parseDateRange('29 ИЮНЯ - 5 ИЮЛЯ 2026')).toEqual({
              start: '2026-06-29',
              end: '2026-07-05',
              year: 2026,
          });
          expect(parseDateRange('4-10 МАЯ 2026')).toEqual({
              start: '2026-05-04',
              end: '2026-05-10',
              year: 2026,
          });
      });
      it('answers nothing to a heading with no dates in it', () => {
          expect(parseDateRange('СОДЕРЖАНИЕ')).toBeNull();
      });
  });
}
SUITES.push(['wt', wt_parser_new_year_week_spec_ts]);

for (const [mod, suite] of SUITES) suite(MODULES[mod]);

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`\n${failures.length} из ${passed + failures.length} — разбор программы разошёлся с ожидаемым`);
  process.exit(1);
}
console.log(`OK: ${passed} проверок разбора рабочей тетради и «Сторожевой башни».`);
