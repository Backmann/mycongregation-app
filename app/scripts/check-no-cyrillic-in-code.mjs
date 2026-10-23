#!/usr/bin/env node
/**
 * NO RUSSIAN WORDS IN THE APP'S CODE (23 October 2026).
 *
 * The walk in German and English found Russian on German and English screens
 * that no translation file could fix, because the words were in the code:
 * «Песня» in the song picker, «ваше» read out to a screen reader, the S-21
 * card, month names. Words a person reads live in locales/*.json; the code
 * holds keys.
 *
 * Every string literal in app/, components/ and lib/ is read (comments are
 * not), and a Cyrillic letter in it fails the gate — unless the file is one of
 * the few whose Russian is the point (they READ Russian: the workbook parsers,
 * the legal texts kept per language, the per-language tables), or the line, or
 * the one above it, says `cyrillic-ok:` and why.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files whose Russian is the point, and why. */
const ALLOWED = new Map([
  ['lib/legal-content.ts', 'the legal texts, kept in each language side by side'],
  ['lib/mwb-parser.ts', 'reads the Russian workbook'],
  ['lib/wt-parser.ts', 'reads the Russian Watchtower and writes the programme in its words'],
  ['lib/reader-titles.ts', 'recognises the workbook’s Russian fixed names to translate them'],
  ['lib/s21.ts', 'the card in each language side by side'],
  ['lib/password.ts', 'Russian passwords people actually try'],
  ['lib/month-label.ts', 'Russian genitive month names'],
  ['lib/parts.ts', 'recognises Russian part titles'],
  ['lib/field-topic.ts', 'recognises «Длительность» in imported topics'],
  ['lib/push-notifications.ts', 'channel names in each language side by side'],
]);

const CYR = /[Ѐ-ӿ]/;
const files = [];
for (const top of ['app', 'components', 'lib']) {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, top));
}

/** The string literals of one line, with comments taken out first. */
function literals(line, state) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf('*/', i);
      if (end < 0) return out;
      state.block = false;
      i = end + 2;
      continue;
    }
    const c = line[i];
    if (c === '/' && line[i + 1] === '*') { state.block = true; i += 2; continue; }
    if (c === '/' && line[i + 1] === '/') return out;
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      out.push(line.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    // JSX text between tags: >текст<
    if (c === '>' ) {
      const j = line.indexOf('<', i + 1);
      if (j > i && !/[{};=]/.test(line.slice(i + 1, j))) out.push(line.slice(i + 1, j));
    }
    i++;
  }
  return out;
}

const bad = [];
for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (ALLOWED.has(rel)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  const state = { block: false };
  lines.forEach((line, n) => {
    const hits = literals(line, state).filter((s) => CYR.test(s));
    if (!hits.length) return;
    if (/cyrillic-ok:/.test(line) || /cyrillic-ok:/.test(lines[n - 1] ?? '')) return;
    bad.push(`${rel}:${n + 1}: ${hits[0].slice(0, 60)}`);
  });
}
if (bad.length) {
  console.error('✗ Русские слова в коде приложения — им место в locales/*.json:');
  for (const b of bad) console.error('  ' + b);
  console.error('Если русский здесь по делу — строкой выше «// cyrillic-ok: почему».');
  process.exit(1);
}
console.log(`✓ Русских слов в коде нет: ${files.length} файлов`);
