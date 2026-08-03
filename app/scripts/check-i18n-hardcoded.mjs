#!/usr/bin/env node
// scripts/check-i18n-hardcoded.mjs
//
// Catches Russian text that never went through the translation files.
//
// The other two checks watch the KEYS: drift makes sure ru/en/de hold the same
// ones, usage makes sure every t('…') resolves. Neither can see a screen that
// simply writes 'Закрыть месяц' in place, because there is no key to be
// missing — and that is how a whole date picker ended up showing Russian month
// names to every German reader, and how a summary screen kept seven Russian
// sentences long after the rest of the app had been translated.
//
// What is flagged (Cyrillic only — the base locale is Russian, so Russian text
// in the source is the tell):
//   • JSX text between tags:            <Text>Закрыть месяц</Text>
//   • string literals in props that reach the eye:
//     title, label, placeholder, header*, subtitle, message, text, confirmLabel
//   • a string literal handed to notify(…) or confirm(…)
//
// What is NOT flagged, deliberately — Russian belongs there:
//   • comments of every kind,
//   • files on the ALLOW list below: parsers matching Russian source text,
//     song titles, legal texts, the printed forms (printing is Russian-only
//     for now — a separate decision), and the locale files themselves,
//   • values written into DATA rather than onto the screen are NOT reliably
//     distinguishable here, so anything the list below does not cover has to
//     be either translated or added to the list with a reason.
//
// Usage: node scripts/check-i18n-hardcoded.mjs   (run from the app project dir)

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const SCAN_DIRS = ['app', 'components', 'hooks'];
const SRC_EXT = new Set(['.ts', '.tsx']);
const CYRILLIC = /[А-Яа-яЁё]/;

/**
 * Files where Russian text is the point, with the reason it is exempt.
 * Add to this list only when the text is not read off a screen by a user.
 */
const ALLOW = [
  ['lib/', 'parsers, printed forms, song and legal texts — see the note above'],
  ['locales/', 'the translation files themselves'],
  ['scripts/', 'the checks, including this one'],
  [
    'app/(app)/profile/songs-import.tsx',
    'the placeholder IS the Russian import format being pasted',
  ],
  ['app/+html.tsx', 'static web shell, rendered before any language is known'],
  [
    'app/(app)/profile/public-talks-import.tsx',
    'the sample line IS the Russian talk list being pasted',
  ],
];

const PROP_NAMES = new Set([
  'title',
  'label',
  'placeholder',
  'subtitle',
  'message',
  'text',
  'headerTitle',
  'confirmLabel',
  'cancelLabel',
  'emptyText',
]);

const CALLS = /\b(notify|confirm|reportError|reportSuccess)\s*\(\s*(['"`])([^'"`]*)\2/g;
const PROP = /\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{?\s*(['"`])([^'"`]*)\2/g;
const JSX_TEXT = />\s*([^<>{}\n][^<>{}]*?)\s*</g;

const problems = [];

function allowed(path) {
  const p = path.replace(/\\/g, '/');
  return ALLOW.some(([prefix]) => p.startsWith(prefix) || p.includes(prefix));
}

/** Strip comments so the prose in them is never mistaken for a screen string. */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else if (c === '{' && src.slice(i, i + 4) === '{/* ') {
      const end = src.indexOf('*/}', i);
      const chunk = src.slice(i, end === -1 ? src.length : end + 3);
      out += chunk.replace(/[^\n]/g, ' ');
      i = end === -1 ? src.length : end + 3;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

async function scanFile(path) {
  if (allowed(path)) return;
  const raw = await readFile(path, 'utf8');
  if (!CYRILLIC.test(raw)) return;
  const src = stripComments(raw);

  const seen = new Set();
  const add = (index, kind, text) => {
    const line = lineOf(src, index);
    const id = `${line}:${text}`;
    if (seen.has(id)) return;
    seen.add(id);
    problems.push({ file: path, line, kind, text: text.trim().slice(0, 60) });
  };

  for (const m of src.matchAll(CALLS)) {
    if (CYRILLIC.test(m[3])) add(m.index, `${m[1]}()`, m[3]);
  }
  for (const m of src.matchAll(PROP)) {
    if (PROP_NAMES.has(m[1]) && CYRILLIC.test(m[3])) add(m.index, m[1], m[3]);
  }
  for (const m of src.matchAll(JSX_TEXT)) {
    if (CYRILLIC.test(m[1])) add(m.index, 'JSX text', m[1]);
  }
}

async function walk(dir) {
  let ents;
  try {
    ents = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (
        ['node_modules', '.git', '.expo', '.next', 'dist', 'build', 'ios', 'android'].includes(
          e.name,
        )
      ) {
        continue;
      }
      await walk(p);
    } else if (SRC_EXT.has(extname(e.name)) && !e.name.endsWith('.d.ts')) {
      scanned++;
      await scanFile(p);
    }
  }
}

let scanned = 0;
for (const d of SCAN_DIRS) await walk(d);

problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
if (problems.length > 0) {
  console.error(
    `i18n hardcoded: ${problems.length} Russian string(s) that never reach the locale files:\n`,
  );
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  ${p.kind}: ${p.text}`);
  }
  console.error(
    '\nMove the text into locales/*.json and read it with t(), or — if it is not\n' +
      'something a user reads on screen — add the file to ALLOW with the reason.',
  );
  process.exit(1);
}
console.log(
  `OK: no hardcoded Russian in screens or components (${scanned} files scanned).`,
);
