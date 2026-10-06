#!/usr/bin/env node
/**
 * Every screen has a decision about who it is for, and every stack asks.
 *
 * lib/screen-access.ts is a table: screen → who may stand on it. It only
 * protects what is written in it, and only where the gate is actually placed.
 * So, four things:
 *
 *   1. every screen file under app/(app) is in the table — a new screen fails
 *      here until somebody has decided who it is for;
 *   2. the table names no screen that is gone, and none twice;
 *   3. every stack under app/(app) puts the gate before its screens, and
 *      names its own folder to it (the gate builds the screen's key from that
 *      name: a wrong one would look every screen up under another folder and
 *      find nothing — which lets everything through);
 *   4. «self» — the screen answers for itself — is written only where the
 *      screen visibly does: it forwards, or it draws the server's refusal, or
 *      it is one of the few named below with the reason.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const APP = join(ROOT, 'app', '(app)');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const problems = [];

// ── the table, as written ──────────────────────────────────────────────
const source = read('lib/screen-access.ts');
const tableText = source.slice(source.indexOf('export const SCREEN_ACCESS'), source.indexOf('export function screenAllowed'));
const entries = [...tableText.matchAll(/^\s*'(\/[^']*)':\s*'([A-Za-z]+)',/gm)].map((m) => [m[1], m[2]]);
const table = new Map(entries);
if (entries.length < 60) problems.push(`таблица прочитана не целиком: строк ${entries.length}`);
for (const [route] of entries) {
  if (entries.filter(([r]) => r === route).length > 1) problems.push(`${route}: в таблице дважды`);
}
const rulesText = source.slice(source.indexOf('export const ACCESS_RULES'), source.indexOf('export const SCREEN_ACCESS'));
const rules = new Set([...rulesText.matchAll(/^\s{2}([A-Za-z]+):/gm)].map((m) => m[1]));
for (const [route, rule] of entries) {
  if (!rules.has(rule)) problems.push(`${route}: правила «${rule}» нет`);
}

// ── 1 and 2: the screens, as they are on disk ──────────────────────────
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx') && name !== '_layout.tsx') out.push(p);
  }
  return out;
};
const fileOf = new Map();
for (const file of walk(APP)) {
  const route = file
    .slice(APP.length)
    .replace(/\\/g, '/')
    .replace(/\.tsx$/, '')
    .replace(/\/index$/, '');
  fileOf.set(route, file);
}
for (const route of fileOf.keys()) {
  if (!table.has(route)) {
    problems.push(`${route}: экран есть, а в lib/screen-access.ts не сказано, кому он открыт`);
  }
}
for (const route of table.keys()) {
  if (!fileOf.has(route)) problems.push(`${route}: в таблице есть, а экрана такого нет`);
}

// ── 3: every stack asks ────────────────────────────────────────────────
const folders = readdirSync(APP).filter((n) => statSync(join(APP, n)).isDirectory());
for (const folder of folders) {
  const layout = join(APP, folder, '_layout.tsx');
  if (!existsSync(layout)) {
    problems.push(`app/(app)/${folder}: нет _layout.tsx — экраны этой папки ничем не проверяются`);
    continue;
  }
  const text = readFileSync(layout, 'utf8');
  const asked = [...text.matchAll(/screenLayout=\{screenGate\('([^']+)'\)\}/g)].map((m) => m[1]);
  if (asked.length !== 1) {
    problems.push(`app/(app)/${folder}/_layout.tsx: проверка на входе должна стоять ровно один раз, а стоит ${asked.length}`);
  } else if (asked[0] !== `/${folder}`) {
    problems.push(`app/(app)/${folder}/_layout.tsx: проверке названа папка «${asked[0]}», а это «/${folder}»`);
  }
  if ((text.match(/<Stack[\s>]/g) ?? []).filter((m) => m).length < 1) {
    problems.push(`app/(app)/${folder}/_layout.tsx: это не стопка экранов — проверка на входе к ней не приложена`);
  }
}

// ── 4: «self» only where the screen does answer for itself ─────────────
const SELF_BY_NAME = new Map([
  ['/schedule/edit', 'уводит сам, на ту же неделю ленты'],
  ['/schedule/conduct', 'председателю этой встречи и администратору — какая встреча, знает экран'],
  ['/schedule/[id]', 'одна часть программы; решают экран и сервер'],
  ['/publishers/[id]', 'карточка: старейшинам и своей группе — решает сервер'],
  ['/service-groups/[id]', 'группа: своя — решает сервер'],
  ['/service-reports/audit-log', 'история одного отчёта — решает сервер'],
  ['/service-reports/publisher-history', 'история одного возвещателя — решает сервер'],
]);
for (const [route, rule] of entries) {
  if (rule !== 'self' || !fileOf.has(route)) continue;
  const text = readFileSync(fileOf.get(route), 'utf8');
  const forwards = /<Redirect\b/.test(text);
  const drawsRefusal = /\bLoadFailure\b/.test(text);
  if (!forwards && !drawsRefusal && !SELF_BY_NAME.has(route)) {
    problems.push(`${route}: записан как «отвечает сам», но не уводит и не рисует отказ сервера — впишите правило или причину в scripts/check-screen-access.mjs`);
  }
}
for (const route of SELF_BY_NAME.keys()) {
  if (table.get(route) !== 'self') problems.push(`${route}: назван здесь «отвечает сам», а в таблице у него «${table.get(route)}»`);
}

if (problems.length) {
  console.error('✗ Кому открыт экран:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
const closed = entries.filter(([, r]) => r !== 'all' && r !== 'self').length;
console.log(`✓ Кому открыт экран: ${entries.length} экранов в таблице (${closed} — не для всех), ${folders.length} стопок спрашивают на входе`);
