#!/usr/bin/env node
/**
 * The card's edit screen hands the form every field the form keeps.
 *
 * The edit screen builds the form's starting values field by field. A field
 * the form keeps but the screen does not hand over starts at the form's
 * default, and saving the card for ANY reason writes that default back. That
 * happened twice: «Духовный статус» from 13 July to 30 October 2026 (every
 * save wiped what was set, the mark the S-21 prints), and the special
 * pioneer's monthly goal on its first day. This check reads both files and
 * names any field the form keeps that the edit screen leaves out.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const form = readFileSync(join(ROOT, 'components/PublisherForm.tsx'), 'utf8');
const edit = readFileSync(join(ROOT, 'app/(app)/publishers/[id].tsx'), 'utf8');

/** Top-level keys of the object literal that follows `marker`. */
function keysAfter(src, marker, file) {
  const at = src.indexOf(marker);
  if (at < 0) {
    console.error(`${file}: не найдено «${marker}» — проверку нужно поправить вместе с кодом`);
    process.exit(1);
  }
  let i = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  let start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = src.slice(start + 1, i);
  // Keys at depth 0 of the literal: «name:» at the start of a line.
  const keys = new Set();
  let d = 0;
  for (const line of body.split('\n')) {
    const m = d === 0 ? line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/) : null;
    if (m) keys.add(m[1]);
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') d++;
      else if (ch === '}' || ch === ')' || ch === ']') d--;
    }
  }
  return keys;
}

const kept = keysAfter(form, 'useState<CreatePublisherInput>({', 'PublisherForm.tsx');
const handed = keysAfter(edit, 'initial={{', 'publishers/[id].tsx');
const missing = [...kept].filter((k) => !handed.has(k));
if (kept.size < 10) {
  console.error(`PublisherForm.tsx: найдено только ${kept.size} полей формы — проверка разучилась читать файл`);
  process.exit(1);
}
if (missing.length) {
  console.error(
    'Экран правки карточки не передаёт форме поля: ' +
      missing.join(', ') +
      '.\nФорма начнёт их со значения по умолчанию, и любое сохранение карточки перезапишет их.',
  );
  process.exit(1);
}
console.log(`✓ Форма карточки получает все свои поля: ${kept.size}`);
