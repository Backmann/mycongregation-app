#!/usr/bin/env node
/**
 * The notification routing table, kept in step.
 *
 * Where a tapped notification leads is decided in TWO places: the service
 * worker, which the browser loads on its own and which therefore cannot
 * import anything from lib/, and the native tap handler in
 * lib/push-notifications.ts. There is no way to share the code, so the table
 * is duplicated on purpose — and a duplicated rule in this project has drifted
 * apart every single time it was left unwatched: the week rules three times,
 * the parsers, the meeting day, the microphone count.
 *
 * The two copies sit between the same pair of markers. This compares them
 * character for character, ignoring only indentation, and fails the gate the
 * moment one side is edited alone.
 *
 * It also checks that every path in the table is a route that exists, so a
 * renamed screen shows up here rather than as a blank page in somebody's hand.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const COPIES = [
  'public/service-worker.js',
  'lib/push-notifications.ts',
];

const START = '// <<< NOTIFICATION ROUTES';
const END = '// >>> NOTIFICATION ROUTES';

function extract(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const from = text.indexOf(START);
  const to = text.indexOf(END);
  if (from < 0 || to < 0) {
    console.error(`В ${rel} нет разметки таблицы маршрутов (${START} … ${END}).`);
    process.exit(1);
  }
  return text.slice(from, to + END.length);
}

/** Indentation may differ between a function body and a method; nothing else. */
const normalize = (s) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');

const [a, b] = COPIES.map(extract);
if (normalize(a) !== normalize(b)) {
  const la = normalize(a).split('\n');
  const lb = normalize(b).split('\n');
  console.error('Таблицы маршрутов уведомлений РАЗОШЛИСЬ:\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      console.error(`  строка ${i + 1}`);
      console.error(`    ${COPIES[0]}: ${la[i] ?? '(нет)'}`);
      console.error(`    ${COPIES[1]}: ${lb[i] ?? '(нет)'}`);
    }
  }
  console.error('\nПравить нужно ОБА файла.');
  process.exit(1);
}

// --- every path must be a route that exists -------------------------------

function routeFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, acc);
    else if (entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

const routes = new Set(
  routeFiles(join(ROOT, 'app')).map((f) => {
    const rel = relative(join(ROOT, 'app'), f).split('\\').join('/');
    return (
      '/' +
      rel
        .replace(/\.tsx$/, '')
        .replace(/\/index$/, '')
        .replace(/\([^)]*\)\//g, '')
        .replace(/^\([^)]*\)$/, '')
    ).replace(/\/+$/, '') || '/';
  }),
);

// A path built from the notification's data — `/special-events/${data.eventId}` —
// is checked as its route pattern: every `${…}` must land on a [param] segment.
const DYN = '[*]';
const shape = (p) => p.replace(/\$\{[^}]+\}/g, DYN).replace(/\[[^\]]+\]/g, DYN);
const shapes = new Set([...routes].map(shape));
const used = [
  ...[...normalize(a).matchAll(/path: '([^']+)'/g)].map((m) => m[1]),
  ...[...normalize(a).matchAll(/path: `([^`]+)`/g)].map((m) => m[1]),
];
const missing = [...new Set(used)].filter((p) =>
  p.includes('${') ? !shapes.has(shape(p)) : !routes.has(p),
);

if (missing.length > 0) {
  console.error('Маршруты уведомлений ведут туда, где нет экрана:\n');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

// --- every type the server sends must lead somewhere -----------------------
//
// The table above was only ever compared with ITSELF. The server went on
// adding kinds of notification, and four of them had no line here at all —
// «задача на завтра» from the very first day (found 3 October 2026): the
// message arrived, the tap opened whatever screen the app happened to be on.
// The server keeps its types in one list; each of them needs a `case` here.
let serverTypes = null;
try {
  const text = readFileSync(
    join(ROOT, '..', 'server', 'src', 'notifications', 'notification-types.ts'),
    'utf8',
  );
  const body = text.slice(text.indexOf('NOTIFICATION_TYPES = ['));
  serverTypes = [...body.slice(0, body.indexOf(']')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
} catch {
  // The server is not checked out beside the app (CI of the app alone).
}
if (serverTypes) {
  if (serverTypes.length === 0) {
    console.error('Список типов уведомлений сервера пуст или не читается.');
    process.exit(1);
  }
  const cases = new Set([...normalize(a).matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]));
  const nowhere = serverTypes.filter((t) => !cases.has(t));
  if (nowhere.length > 0) {
    console.error('Сервер шлёт уведомления, у которых нажатие никуда не ведёт:\n');
    for (const t of nowhere) console.error('  ' + t);
    console.error('\nДобавить `case` нужно в ОБА файла: ' + COPIES.join(' и ') + '.');
    process.exit(1);
  }
}

console.log(
  `OK: notification routes match, ${new Set(used).size} destinations all exist` +
    (serverTypes ? `, all ${serverTypes.length} server types lead somewhere.` : '.'),
);
