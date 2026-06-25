#!/usr/bin/env node
// scripts/check-i18n-usage.mjs
//
// Catches broken translation keys BEFORE deploy. Scans the source tree for
// t(...) / i18n.t(...) calls and verifies the key against locales/ru.json
// (the base locale; check-i18n-drift.mjs guarantees en/de mirror ru):
//
//   • Static keys  — t('a.b.c')        -> the path must exist (leaf, object,
//                                          or a CLDR plural like a.b.c_one).
//   • Template keys — t(`a.b.${x}`)    -> the static prefix before `${` must
//                                          resolve to an OBJECT (this is the
//                                          class of bug where the prefix was
//                                          wrong, e.g. `appointment.${x}`
//                                          instead of `publishers.appointment`).
//
// Intentionally skipped (no false positives):
//   • calls with a defaultValue (a missing key is a deliberate fallback),
//   • dynamic first args / string concatenation / template starting with `${`,
//   • non-i18n `t(` tails of longer identifiers (post(, format(), …),
//   • arguments that do not look like a dotted i18n key (URLs, composite keys).
//
// Usage: node scripts/check-i18n-usage.mjs   (run from the app project dir)

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const BASE_LOCALE = 'locales/ru.json';
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'utils'];
const SRC_EXT = new Set(['.ts', '.tsx']);
const PLURAL_SUFFIXES = ['_one', '_other', '_few', '_many', '_zero', '_two'];
const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/;

// ---- load base locale -> leaf keys + object paths ----
const leafKeys = new Set();
const objectPaths = new Set();
function index(obj, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      objectPaths.add(full);
      index(v, full);
    } else {
      leafKeys.add(full);
    }
  }
}
try {
  index(JSON.parse(await readFile(BASE_LOCALE, 'utf8')));
} catch (e) {
  console.error(`Cannot read ${BASE_LOCALE}: ${e.message}`);
  process.exit(1);
}

function staticKeyValid(key) {
  if (leafKeys.has(key) || objectPaths.has(key)) return true;
  return PLURAL_SUFFIXES.some((s) => leafKeys.has(key + s));
}

// ---- string-aware scanner ----
function skipString(src, i, quote) {
  i++; // past opening quote
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (quote === '`' && c === '$' && src[i + 1] === '{') { i = skipBraces(src, i + 1); continue; }
    if (c === quote) return i + 1;
    i++;
  }
  return n;
}
function skipBraces(src, i) {
  let depth = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i, c); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return n;
}
function matchClose(src, start) {
  let depth = 1;
  let i = start;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i, c); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}
function lineOf(src, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

// Returns the first-arg literal of a t(...) span, or null if the first arg is
// not a plain string/template literal (dynamic key, concatenation, …).
function firstKeyLiteral(span) {
  let i = 0;
  const n = span.length;
  while (i < n && /\s/.test(span[i])) i++;
  const q = span[i];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  const end = skipString(span, i, q);
  let j = end;
  while (j < n && /\s/.test(span[j])) j++;
  if (j < n && span[j] !== ',') return null; // not a standalone first arg
  return {
    inner: span.slice(i + 1, end - 1),
    isTemplate: q === '`',
    hasDefault: /\bdefaultValue\b/.test(span.slice(end)),
  };
}

const problems = [];
let verified = 0;
function checkCall(inner, isTemplate, hasDefault, file, line) {
  if (hasDefault) return;
  if (isTemplate) {
    const idx = inner.indexOf('${');
    if (idx === -1) {
      if (!KEY_SHAPE.test(inner)) return;
      verified++;
      if (!staticKeyValid(inner))
        problems.push({ file, line, kind: 'missing key', key: inner });
      return;
    }
    const prefix = inner.slice(0, idx);
    if (!prefix.endsWith('.')) return; // ambiguous dynamic prefix
    const path = prefix.slice(0, -1);
    if (!KEY_SHAPE.test(path)) return;
    verified++;
    if (!objectPaths.has(path))
      problems.push({ file, line, kind: 'unknown key prefix', key: `${path}.*` });
    return;
  }
  if (!KEY_SHAPE.test(inner)) return;
  verified++;
  if (!staticKeyValid(inner))
    problems.push({ file, line, kind: 'missing key', key: inner });
}

async function scanFile(file) {
  const src = await readFile(file, 'utf8');
  const n = src.length;
  for (let i = 0; i < n; i++) {
    if (src[i] !== 't' || src[i + 1] !== '(') continue;
    const prev = i > 0 ? src[i - 1] : '';
    if (/[A-Za-z0-9_$]/.test(prev)) continue; // tail of a longer identifier
    const close = matchClose(src, i + 2);
    if (close === -1) continue;
    const lit = firstKeyLiteral(src.slice(i + 2, close));
    if (lit) checkCall(lit.inner, lit.isTemplate, lit.hasDefault, file, lineOf(src, i));
    i = close;
  }
}

async function walk(dir) {
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', '.expo', '.next', 'dist', 'build', 'ios', 'android'].includes(e.name)) continue;
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
  console.error(`i18n usage: ${problems.length} broken translation key(s):\n`);
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.kind}: ${p.key}`);
  console.error('\nAdd the key to locales/*.json, or fix the key path in the source.');
  process.exit(1);
}
console.log(
  `OK: ${verified} static t() keys/prefixes resolve in ru.json (${scanned} files scanned).`,
);