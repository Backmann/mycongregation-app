#!/usr/bin/env node
/**
 * Dates are written the way each language writes them (lib/date-patterns.ts,
 * 16 October 2026): the screens' Russian-order patterns come out as
 * «17. Oktober» in German and «Sat, October 17» in English (American, 23 October 2026), while Russian and
 * every pattern without a day before a month stay exactly as they were.
 * Checked through real dayjs with the plugin installed the way
 * lib/dayjs-locales.ts installs it. Called directly from the gate, never
 * through a new npm script (that block is an input to the Expo fingerprint).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'date-patterns-'));
writeFileSync(
  join(out, 'date-patterns.mjs'),
  ts.transpileModule(readFileSync(join(ROOT, 'lib', 'date-patterns.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { localizePattern } = await import(pathToFileURL(join(out, 'date-patterns.mjs')));

// The plugin must still be wired where every screen gets it.
const wiring = readFileSync(join(ROOT, 'lib', 'dayjs-locales.ts'), 'utf8');
assert.match(wiring, /localizePattern\(template, this\.locale\(\)\)/, 'lib/dayjs-locales.ts no longer runs patterns through localizePattern');

const dayjs = require('dayjs');
require('dayjs/locale/ru');
require('dayjs/locale/de');
dayjs.extend((_o, D) => {
  const f = D.prototype.format;
  D.prototype.format = function (t) {
    return f.call(this, t ? localizePattern(t, this.locale()) : t);
  };
});

const d = dayjs('2026-10-17'); // a Saturday
const cases = [
  // pattern, ru, de, en
  ['D MMMM', '17 октября', '17. Oktober', 'October 17'],
  ['D MMMM YYYY', '17 октября 2026', '17. Oktober 2026', 'October 17, 2026'],
  ['D MMM', '17 окт.', '17. Okt.', 'Oct 17'],
  ['dd, D MMMM', 'сб, 17 октября', 'Sa., 17. Oktober', 'Sat, October 17'],
  ['dd D MMM', 'сб 17 окт.', 'Sa., 17. Okt.', 'Sat, Oct 17'],
  ['dddd, D MMMM', 'суббота, 17 октября', 'Samstag, 17. Oktober', 'Saturday, October 17'],
  ['dd, D MMMM YYYY', 'сб, 17 октября 2026', 'Sa., 17. Oktober 2026', 'Sat, October 17, 2026'],
  // Untouched: no day before a month.
  ['MMMM YYYY', 'октябрь 2026', 'Oktober 2026', 'October 2026'],
  ['dd', 'сб', 'Sa', 'Sa'],
  ['DD.MM', '17.10', '17.10', '17.10'],
  ['D', '17', '17', '17'],
  ['YYYY-MM-DD', '2026-10-17', '2026-10-17', '2026-10-17'],
];
let n = 0;
for (const [p, ru, de, en] of cases) {
  for (const [lang, want] of [['ru', ru], ['de', de], ['en', en]]) {
    try {
      assert.equal(d.locale(lang).format(p), want);
      n++;
    } catch (e) {
      console.error(`✗ '${p}' in ${lang}: ${e.message.split('\n')[0]}`);
      process.exitCode = 1;
    }
  }
}
// Applied twice it changes nothing more (a German pattern written by hand stays right).
for (const p of ['D. MMMM', 'dd., D. MMMM', 'ddd, D MMMM']) {
  assert.equal(localizePattern(p, 'de'), p.startsWith('ddd') ? 'ddd, D. MMMM' : p);
  assert.equal(localizePattern(localizePattern('dd, D MMMM', 'en'), 'en'), 'ddd, MMMM D');
  n++;
}
assert.equal(localizePattern('[am] D MMMM', 'de'), '[am] D MMMM');
if (process.exitCode) process.exit(1);
console.log(`✓ Даты по-немецки и по-английски: ${n} проверок`);
