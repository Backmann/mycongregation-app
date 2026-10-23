#!/usr/bin/env node
/**
 * A SPAN OF DAYS IS WRITTEN BY lib/date-range.ts (23 October 2026).
 *
 * The walk in German and English found a dozen spans glued by hand, each
 * broken its own way: «8–December 13», «20–22. November», «26–1. Nov.»,
 * «November 4 – November 4, 2026». Two checks:
 *  1. formatDayRange says the agreed thing in ru, de and en (American);
 *  2. no line in the app glues two formatted dates with a dash again.
 * Called directly from the gate (scripts/gate.mjs), never via npm scripts.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'date-range-'));
writeFileSync(
  join(out, 'date-range.mjs'),
  ts.transpileModule(readFileSync(join(ROOT, 'lib', 'date-range.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const { formatDayRange, formatDay } = await import(pathToFileURL(join(out, 'date-range.mjs')));

let n = 0;
const eq = (got, want, what) => {
  // Intl puts thin and narrow spaces where it likes; compare by plain spaces.
  const norm = (s) => s.replace(/[   ]/g, ' ');
  assert.equal(norm(got), norm(want), what);
  n++;
};
const never = { year: 'never' };
eq(formatDayRange('2026-11-20', '2026-11-22', 'ru', never), '20–22 ноября', 'ru within a month');
eq(formatDayRange('2026-11-20', '2026-11-22', 'de', never), '20.–22. November', 'de within a month');
eq(formatDayRange('2026-11-20', '2026-11-22', 'en', never), 'November 20 – 22', 'en within a month');
eq(formatDayRange('2026-10-26', '2026-11-01', 'de', { month: 'short', year: 'never' }), '26. Okt. – 1. Nov.', 'de across two months');
eq(formatDayRange('2026-12-08', '2026-12-13', 'en', never), 'December 8 – 13', 'en: never «8–December 13»');
eq(formatDayRange('2026-11-04', '2026-11-04', 'en', { year: 'always' }), 'November 4, 2026', 'one day is one date');
eq(formatDayRange('2026-11-04', null, 'de', { year: 'always' }), '4. November 2026', 'no end is one date');
eq(formatDay('2026-11-18', 'de', { weekday: 'long', year: 'never' }), 'Mittwoch, 18. November', 'a day with its weekday');

// No dates glued by hand.
// A day number glued to a dash: «${start.getDate()}–${…}», also written with
// the \u2013 escape (my-assignments hid one that way).
const DAY_DASH = /getDate\(\)\}\s?(?:[–—]|\\u201[34])/;
const GLUED = /\$\{[^}]*(?:fmt|format|Date|day|d)\([^}]*\)\}\s?(?:[–—]|\\u201[34])\s?\$\{[^}]*(?:fmt|format|Date|day|d)\(/;
const bad = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) {
      const rel = relative(ROOT, p).replace(/\\/g, '/');
      // The library of spans itself, and the older week formatters.
      if (['lib/date-range.ts', 'lib/dates.ts', 'lib/week-range.ts'].includes(rel)) continue;
      const lines = readFileSync(p, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!(GLUED.test(line) || DAY_DASH.test(line)) || /time|Time/.test(line)) return;
        if (/date-span-ok:/.test(lines[i - 1] ?? '') || /date-span-ok:/.test(line)) return;
        bad.push(`${rel}:${i + 1}`);
      });
    }
  }
};
for (const top of ['app', 'components', 'lib']) walk(join(ROOT, top));
if (bad.length) {
  console.error('✗ Даты, склеенные вручную через тире — пишите их через lib/date-range.ts:');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`✓ Промежутки дат по правилам языка: ${n} проверок, склеенных вручную нет`);
