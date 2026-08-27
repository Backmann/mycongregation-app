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

const used = [...normalize(a).matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
const missing = [...new Set(used)].filter((p) => !routes.has(p));

if (missing.length > 0) {
  console.error('Маршруты уведомлений ведут туда, где нет экрана:\n');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

console.log(
  `OK: notification routes match, ${new Set(used).size} destinations all exist.`,
);
