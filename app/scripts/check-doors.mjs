#!/usr/bin/env node
/**
 * A door to a screen asks the screen's own rule.
 *
 * lib/screen-access.ts says who each screen is for, and the gate before every
 * screen holds it to that. The DOORS — rows of «Собрание» and «Служение»,
 * buttons in headers, links in cards — each used to carry a condition of
 * their own, written to match the screen's. Two did not: every elder was
 * offered «Снять речи», and whoever makes events was sent into the talk
 * coordinator's log; both opened onto «Нет доступа».
 *
 * Now a door asks `mayOpen('/that/screen')` (lib/useMayOpen), which reads the
 * table. This check finds every place the app names a screen that is not open
 * to everybody, and passes it only if
 *
 *   • the same file asks mayOpen() for that very screen, or
 *   • the file hands its doors to DoorList, which asks for each of them, or
 *   • the file is itself a screen under the SAME rule — whoever stands on it
 *     may stand on the other, or
 *   • the file is an old address that only forwards — a few lines and a
 *     <Redirect> (the screen it forwards to is checked by the gate), or
 *   • it is named in NARROWER below, with the reason.
 *
 * A new link to a restricted screen fails here until it asks.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const problems = [];

/**
 * Doors that do not ask mayOpen(), each for a reason. `file → screen`.
 * An entry that no longer matches anything fails the check, so this list
 * cannot outlive what it excuses.
 */
const NARROWER = new Map([
  [
    'app/(app)/schedule/index.tsx → /publishers/duties-meeting',
    '«Изменить» под обязанностями встречи: только тому, кто их ведёт (canEditDuties), а экран читают и старейшины',
  ],
  [
    'lib/push-notifications.ts → /tasks/agenda',
    'куда ведёт уведомление о встрече совета: его получают только старейшины, остальных остановит сам экран',
  ],
]);

// ── the table ──────────────────────────────────────────────────────────
const source = read('lib/screen-access.ts');
const tableText = source.slice(
  source.indexOf('export const SCREEN_ACCESS'),
  source.indexOf('export function screenAllowed'),
);
const table = new Map(
  [...tableText.matchAll(/^\s*'(\/[^']*)':\s*'([A-Za-z]+)',/gm)].map((m) => [m[1], m[2]]),
);
if (table.size < 60) problems.push(`таблица прочитана не целиком: строк ${table.size}`);
const open = (rule) => rule === 'all' || rule === 'self';

// ── DoorList really asks ───────────────────────────────────────────────
const doorList = read('components/DoorList.tsx');
if (!/doors\.filter\(\(d\) => mayOpen\(d\.href\)\)/.test(doorList)) {
  problems.push('components/DoorList.tsx: двери больше не отбираются через mayOpen(d.href)');
}
const hook = read('lib/useMayOpen.ts');
if (!/screenAllowed\(route\.split\('\?'\)\[0\], perms, user\)/.test(hook)) {
  problems.push('lib/useMayOpen.ts: mayOpen больше не спрашивает таблицу (screenAllowed)');
}

// ── every place a restricted screen is named ───────────────────────────
const walk = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
};
// Not doors: the table itself; the server's addresses (lib/api.ts shares
// some spellings with the screens).
const SKIP = new Set(['lib/screen-access.ts', 'lib/api.ts']);
// A screen named here is not a way INTO it: where «back» falls when there is
// nothing to go back to; the folder a gate is told; a `from=` to return to;
// and the question itself.
const NOT_A_DOOR = /(fallback=\{?|screenGate\(|encodeURIComponent\(|mayOpen\()\s*$/;

const ownRoute = (file) => {
  if (!file.startsWith('app/(app)/') || file.endsWith('_layout.tsx')) return null;
  return file.slice('app/(app)'.length).replace(/\.tsx$/, '').replace(/\/index$/, '');
};
const strip = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const used = new Set();
let doors = 0;
for (const file of [...walk('app'), ...walk('components'), ...walk('lib')]) {
  if (SKIP.has(file)) continue;
  const text = strip(read(file));
  const own = table.get(ownRoute(file) ?? '');
  // An old address: a few lines that forward and draw nothing of their own.
  const forwards = own === 'self' && /<Redirect\b/.test(text) && text.split('\n').length <= 30;
  const viaDoorList = /<DoorList\b/.test(text);
  for (const m of text.matchAll(/(['"`])(\/[a-z][^'"`?$\s]*)(\$\{)?/g)) {
    let route = m[2];
    // «/pioneer-school/${id}» is the screen «/pioneer-school/[id]».
    if (m[3] && route.endsWith('/')) route += '[id]';
    route = route.replace(/\/$/, '');
    const rule = table.get(route);
    if (rule === undefined || open(rule)) continue;
    if (NOT_A_DOOR.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
    doors++;
    const key = `${file} → ${route}`;
    if (NARROWER.has(key)) {
      used.add(key);
      continue;
    }
    const asks = new RegExp(`mayOpen\\(\\s*['"\`]${route.replace(/[[\]/]/g, '\\$&')}['"\`]\\s*\\)`).test(text);
    if (asks || viaDoorList || own === rule || forwards) continue;
    problems.push(
      `${file}: ведёт на ${route} (правило «${rule}»), но не спрашивает mayOpen('${route}') — дверь может открыться тому, кого экран не пустит`,
    );
  }
}
for (const key of NARROWER.keys()) {
  if (!used.has(key)) problems.push(`NARROWER: «${key}» больше ничему не соответствует — убрать из списка`);
}
if (doors < 40) problems.push(`дверей к закрытым экранам найдено всего ${doors} — проверка что-то перестала видеть`);

if (problems.length > 0) {
  console.error(`✗ Двери и таблица доступа расходятся (${problems.length}):`);
  for (const p of [...new Set(problems)]) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(`✓ Двери: ${doors} ссылок на закрытые экраны, каждая спрашивает правило самого экрана`);
