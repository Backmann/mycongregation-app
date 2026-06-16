#!/usr/bin/env node
/**
 * patch-debrand-jw.cjs — убрать марку JW / jw.org из кода (приложение —
 * помощник для организации собрания, без привязки к деноминации). Также
 * заголовок вкладки → mycongregation.org (бренд-имя, единое для языков).
 * Функциональность (public_witnessing, MWB/Watchtower-механика) НЕ трогается —
 * это доменные функции, не марка. README чистится отдельно.
 * Применять ПОВЕРХ 04cf598 (или поверх title-фикса, если он уже лёг).
 * Idempotent; LF/CRLF tolerant. Из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

function patchFile(file, edits, opts = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');
  let changed = false;
  for (const [label, anchor, replacement] of edits) {
    if (!txt.includes(anchor)) {
      if (opts.skipMissing) {
        console.log(`SKIP: ${label} (anchor absent — already clean?)`);
        continue;
      }
      console.log(`FAIL: anchor for "${label}" in ${file} not found`);
      process.exit(1);
    }
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" in ${file} found ${parts.length - 1} times, expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    changed = true;
    console.log(`OK: ${label}`);
  }
  if (changed) {
    fs.writeFileSync(file, txt.split('\n').join(eol));
    console.log(`OK: ${file} written`);
  }
}

// ===== 0) lib/i18n.ts: ставить document.title в syncHtmlLang =====
// (если title-фикс не применялся отдельным коммитом — добавляем здесь)
{
  const file = 'lib/i18n.ts';
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');
  if (txt.includes('document.title')) {
    console.log(`SKIP: ${file} — document.title already set`);
  } else {
    const anchor = '    document.documentElement.lang = lang;';
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: i18n anchor (documentElement.lang) found ${parts.length - 1} times, expected 1`);
      process.exit(1);
    }
    const replacement = nl([
      '    document.documentElement.lang = lang;',
      '    // Non-empty, brand title also gives Chrome a clear language signal.',
      "    const title = i18n.t('app.title');",
      "    if (title && title !== 'app.title') document.title = title;",
    ]);
    txt = parts[0] + replacement + parts[1];
    fs.writeFileSync(file, txt.split('\n').join(eol));
    console.log(`OK: ${file} — document.title set in syncHtmlLang`);
  }
}

// ===== 1) комментарии: убрать "JW" =====
patchFile('lib/mwb-parser.ts', [
  [
    'mwb-parser comment',
    ' * Parses a JW Meeting Workbook (MWB) EPUB into structured weekly programmes',
    ' * Parses a Meeting Workbook (MWB) EPUB into structured weekly programmes',
  ],
], { skipMissing: true });

patchFile('lib/wt-parser.ts', [
  [
    'wt-parser comment',
    ' * Parses a JW Watchtower study EPUB into structured weekly programmes',
    ' * Parses a Watchtower study EPUB into structured weekly programmes',
  ],
], { skipMissing: true });

patchFile('lib/parts.ts', [
  [
    'parts comment: color coding',
    'Mirrors JW workbook color coding.',
    'Mirrors the workbook color coding.',
  ],
  [
    'parts comment: sequential number',
    "/** Parts that get a JW-style sequential number (excludes chairmen/prayers/readers). */",
    '/** Parts that get a sequential number (excludes chairmen/prayers/readers). */',
  ],
  [
    'parts comment: display number',
    '/** Map of assignment id -> JW display number (null for non-numbered info rows). */',
    '/** Map of assignment id -> display number (null for non-numbered info rows). */',
  ],
], { skipMissing: true });

// ===== 2) public-talks-import.tsx: убрать строку с docs.jw.org =====
patchFile('app/(app)/profile/public-talks-import.tsx', [
  [
    'public-talks: drop jw.org source line',
    nl([
      '          {\'\\n\'}',
      '          Existing talks (matched by number) will be updated; new ones',
      '          created. Source: docs.jw.org/ru/-/pub-s-34',
      '        </Text>',
    ]),
    nl([
      '          {\'\\n\'}',
      '          Existing talks (matched by number) will be updated; new ones',
      '          created.',
      '        </Text>',
    ]),
  ],
], { skipMissing: true });

// ===== 3) linkPlaceholder: убрать jw.org из локалей =====
for (const lf of ['locales/ru.json', 'locales/en.json', 'locales/de.json']) {
  let raw;
  try {
    raw = fs.readFileSync(lf, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${lf}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');
  const before = txt;
  txt = txt.replace(/"https:\/\/www\.jw\.org\/…"/g, '"https://…"');
  if (txt !== before) {
    fs.writeFileSync(lf, txt.split('\n').join(eol));
    console.log(`OK: ${lf} — jw.org placeholder removed`);
  } else {
    console.log(`SKIP: ${lf} — no jw.org placeholder`);
  }
}

// ===== 4) заголовок вкладки → mycongregation.org =====
// Меняем app.title в локалях на домен (бренд, единый для всех языков).
for (const lf of ['locales/ru.json', 'locales/en.json', 'locales/de.json']) {
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(lf, 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot parse ${lf}: ${e.message}`);
    process.exit(1);
  }
  if (obj.app && obj.app.title === 'mycongregation.org') {
    console.log(`SKIP: ${lf} — title already domain`);
    continue;
  }
  if (!obj.app) obj.app = {};
  obj.app.title = 'mycongregation.org';
  fs.writeFileSync(lf, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${lf} — app.title = mycongregation.org`);
}

console.log('DONE: JW de-branding (code) + domain title');
