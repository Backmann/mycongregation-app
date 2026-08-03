#!/usr/bin/env node
// scripts/check-i18n-hardcoded.mjs
//
// Catches screen text that never went through the translation files.
//
// The other two checks watch the KEYS: drift makes sure ru/en/de hold the same
// ones, usage makes sure every t('…') resolves. Neither can see a screen that
// simply writes 'Закрыть месяц' in place, because there is no key to be
// missing — and that is how a whole date picker ended up showing Russian month
// names to every German reader, and how a summary screen kept seven Russian
// sentences long after the rest of the app had been translated.
//
// What is flagged — text in ANY language. It used to look for Cyrillic only,
// and so walked straight past a whole screen written in English in the code:
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
 * Text that reads like a sentence someone was meant to read.
 *
 * Cyrillic alone was not enough: this screen was written in ENGLISH in the
 * code — «Bulk import public talks», «Importing…», «Parsed» — and the check
 * looked straight past it, because it was hunting for the wrong alphabet
 * rather than for the wrong PLACE. A hardcoded string is hardcoded in any
 * language.
 *
 * The shape it looks for is prose: either two words in a row, or a single
 * word of three letters or more. That leaves out the things a screen legitimately
 * writes in place — «19:00», «N/A», an icon name, a colour, a route.
 */
const PROSE = /[\p{L}]{3,}|[\p{L}]{2,}\s+[\p{L}]{2,}/u;

/**
 * Shapes that are never prose, however many letters they hold: a path or a
 * timezone name, a URL, an example address, a date format, a colour, an
 * identifier. These belong in the code — nobody reads them as language.
 */
const TECHNICAL = [
  /^[\w-]+\/[\w/-]*$/, // Europe/Berlin, service-reports/new
  /^https?:/, // a URL, or the start of one
  /^[\w.+-]+@[\w.-]+$/, // an example address
  /^[YMDHhms][YMDHhms\-.:/ ]*$/, // YYYY-MM-DD, HH:mm
  /^#[0-9a-fA-F]{3,8}$/, // a colour
  /^[a-z]+(?:[A-Z][a-z]*)+$/, // anIdentifier
  /^[A-Z0-9_]{2,}$/, // A_CONSTANT
  /\$\{/, // a template hole — not a phrase
  /^[DdMmYyHhAaSsZz,. :/-]+$/, // a date FORMAT ("dd, D MMMM YYYY"), not a date
];

const isTechnical = (text) => TECHNICAL.some((re) => re.test(text));

function looksLikeProse(value) {
  const text = value.trim();
  if (text.length < 3) return false;
  if (isTechnical(text)) return false;
  return PROSE.test(text);
}

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
    'components/BrandLockup.tsx',
    'the wordmark — myCongregation.org is a name, not a sentence',
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

/**
 * Two words in a row inside a string literal, ANYWHERE in the file.
 *
 * The props-and-JSX scanners above miss the commonest hiding place of all —
 * a literal inside a JSX expression: `{search ? 'No talks match' : 'None
 * yet'}`. A phrase of two words is prose wherever it stands; single words are
 * left alone here, because that is where the style values and the identifiers
 * live.
 */
const PHRASE = /(['"])((?:[^'"\\\n]|\\.)*)\1/g;
const TWO_WORDS = /\p{L}{2,}[ \u00a0]\p{L}{2,}/u;

/**
 * Offsets of literals that are not screen text: a translation key being looked
 * up, and anything handed to the console — a log line is written for whoever
 * is reading the logs, and that is not a reader whose language we know.
 */
function exemptOffsets(src) {
  const offsets = new Set();
  const patterns = [
    /\b(?:i18n\.)?t\(\s*(['"`])/g,
    /\bconsole\.\w+\(\s*(['"`])/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) offsets.add(m.index + m[0].length - 1);
  }
  return offsets;
}

const CALLS = /\b(notify|confirm|reportError|reportSuccess)\s*\(\s*(['"`])([^'"`]*)\2/g;
const PROP = /\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{?\s*(['"`])([^'"`]*)\2/g;
/**
 * Text sitting between a tag and its closing tag.
 *
 * The closing `</` is what makes this a tag rather than a comparison: the file
 * is full of `a > b && c < d`, and when the check was only hunting Cyrillic
 * that never mattered. Semicolons and equals signs are excluded for the same
 * reason — prose does not contain them, code between two angle brackets does.
 */
const JSX_TEXT = />\s*([^<>{}\n;=][^<>{};=]*?)\s*<\//g;

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
  if (!PROSE.test(raw)) return;
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
    if (looksLikeProse(m[3])) add(m.index, `${m[1]}()`, m[3]);
  }
  for (const m of src.matchAll(PROP)) {
    if (PROP_NAMES.has(m[1]) && looksLikeProse(m[3])) add(m.index, m[1], m[3]);
  }
  for (const m of src.matchAll(JSX_TEXT)) {
    if (looksLikeProse(m[1])) add(m.index, 'JSX text', m[1]);
  }
  const keyOffsets = exemptOffsets(src);
  for (const m of src.matchAll(PHRASE)) {
    if (keyOffsets.has(m.index)) continue;
    const text = m[2];
    if (isTechnical(text) || !TWO_WORDS.test(text)) continue;
    add(m.index, 'string', text);
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
    `i18n hardcoded: ${problems.length} string(s) of screen text that never reach the locale files:\n`,
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
  `OK: no hardcoded screen text (${scanned} files scanned).`,
);
