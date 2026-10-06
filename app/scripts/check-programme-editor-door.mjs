#!/usr/bin/env node
/**
 * «Составление программы» has one rule for who may open it, and the screen
 * asks it too — not only the doors.
 *
 * The doors were right and the screen asked nobody: typed as an address, it
 * opened for a publisher (6 October, on a copy of the live data). A door that
 * checks and a room that does not is the same mistake the server once made
 * with a second path to an old function — so it is held here, in four parts:
 *
 *   1. the rule is made of the same answers as «edits» and «imports», and so
 *      cannot drift from them (lib/permissions.ts);
 *   2. the screen turns away whoever the rule does not let in, waits while the
 *      answer is still arriving, and mounts the editor for nobody else;
 *   3. the two general doors ask this rule and no other;
 *   4. every file that leads to the screen is known here. A new one fails this
 *      check until somebody has looked at who it is shown to.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const problems = [];
const need = (file, what, pattern) => {
  if (!pattern.test(flat(read(file)))) problems.push(`${file}: ${what}`);
};

// 1. The rule.
const P = 'lib/permissions.ts';
need(P, 'правило должно складываться из тех же ответов, что «правит» и «импортирует»',
  /canOpenProgrammeEditor: editsMidweek \|\| editsWeekend \|\| importsProgramme,/);
need(P, 'canEditMidweekSchedule должен быть editsMidweek', /canEditMidweekSchedule: editsMidweek,/);
need(P, 'canEditWeekendSchedule должен быть editsWeekend', /canEditWeekendSchedule: editsWeekend,/);
need(P, 'canImportMidweekSchedule должен быть importsProgramme', /canImportMidweekSchedule: importsProgramme,/);
need(P, 'canImportWeekendSchedule должен быть importsProgramme', /canImportWeekendSchedule: importsProgramme,/);
need(P, 'нужен признак loaded (ответ об обязанностях пришёл)', /loaded: isFetched,/);

// 2. The screen.
const S = 'app/(app)/schedule/edit.tsx';
need(S, 'экран должен впускать по правилу', /if \(perms\.canOpenProgrammeEditor\) return <ProgrammeEditor \/>;/);
need(S, 'экран должен ждать, пока права не известны', /if \(!perms\.loaded\) return null;/);
need(S, 'остальных экран должен уводить в «Программу»', /<Redirect href=\{\(week \? `\/schedule\?week=\$\{week\}` : "\/schedule"\) as never\} \/>/);
need(S, 'сам редактор не должен быть экраном по умолчанию', /\bfunction ProgrammeEditor\(\) \{/);
if (/export default function ProgrammeEditor/.test(read(S))) {
  problems.push(`${S}: редактор снова стал экраном по умолчанию — проверка на входе обойдена`);
}
if ((read(S).match(/export default /g) ?? []).length !== 1) {
  problems.push(`${S}: должен быть ровно один экран по умолчанию`);
}

// 3. The two general doors.
need('app/(app)/publishers/index.tsx', 'дверь в «Собрании» должна спрашивать правило',
  /if \(perms\.canOpenProgrammeEditor\) \{ meetings\.push\(\{ key: 'programme',/);
need('app/(app)/schedule/_layout.tsx', 'дверь в шапке «Программы» должна спрашивать правило',
  /const plans = canOpenProgrammeEditor;/);

// 4. Every way to the screen is a known one.
const KNOWN = new Map([
  ['app/(app)/publishers/index.tsx', 'дверь в «Собрании» — по правилу'],
  ['app/(app)/schedule/_layout.tsx', 'дверь в шапке «Программы» — по правилу; «назад» с экранов самого редактора'],
  ['app/(app)/schedule/index.tsx', '«Править программу» в ленте — тем, кто правит эту встречу'],
  ['app/(app)/schedule/import.tsx', 'после импорта — импортирует тот, кого правило впускает'],
  ['app/(app)/schedule/new.tsx', 'старый адрес, ведёт на экран, а тот проверяет сам'],
  ['app/(app)/home/index.tsx', 'полоска «не готовы встречи» — старейшинам и тем, кто правит'],
  ['app/(app)/local-needs/_layout.tsx', '«назад» из местных потребностей'],
  ['lib/push-notifications.ts', 'уведомление о пробелах — тем, кто собирает встречу'],
  ['lib/screen-access.ts', 'таблица «кому открыт экран»: называет экран, а не ведёт на него'],
]);
const walk = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};
const leads = [];
for (const file of ['app', 'components', 'lib'].flatMap((d) => walk(d))) {
  const rel = relative(ROOT, join(ROOT, file)).replace(/\\/g, '/');
  if (rel === S) continue;
  if (/['"`]\/schedule\/edit/.test(read(rel))) leads.push(rel);
}
for (const file of leads) {
  if (!KNOWN.has(file)) {
    problems.push(`${file}: новый путь к «Составлению программы» — проверьте, кому он показан, и впишите его в scripts/check-programme-editor-door.mjs`);
  }
}
for (const file of KNOWN.keys()) {
  if (!leads.includes(file)) problems.push(`${file}: в списке путей есть, а в коде пути уже нет — уберите из списка`);
}

if (problems.length) {
  console.error('✗ Дверь «Составления программы»:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✓ Дверь «Составления программы»: одно правило у экрана и у ${leads.length} путей к нему`);
