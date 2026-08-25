#!/usr/bin/env node
/**
 * The week rules, checked.
 *
 * `lib/week-rules.ts` answers "which meetings does the congregation hold this
 * week" for four screens — the schedule, the home timeline, my tasks, local
 * needs — and the server answers the same question in
 * `common/week-rules.ts`. They have now drifted apart three times: over the
 * Memorial, over conventions, and over the «в этот день обычной встречи нет»
 * flag. Each drift was found by reading the code months later, never by
 * anything failing.
 *
 * The app has no test runner and adding one mid-flight is its own project, so
 * this is a script — called directly from the gate, like the i18n and date
 * guards, and never through a new npm script (that block is an input to the
 * Expo fingerprint).
 *
 * The cases below are the SAME ones the server's spec pins, in the same words,
 * so a future change that moves one side shows up here rather than in April.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

// The module is TypeScript and imports only `./api` (for types) and `./dates`.
// Types vanish at transpile time; `./dates` is real and comes along.
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'week-rules-'));
for (const name of ['week-rules', 'dates']) {
  const src = readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  writeFileSync(join(out, `${name}.mjs`), js.replace(/'\.\/dates'/g, "'./dates.mjs'"));
}
const { weekRules } = await import(pathToFileURL(join(out, 'week-rules.mjs')));

// Monday 2026-04-06. Midweek meeting Thursday (dow 4), weekend Sunday (dow 7).
const WEEK = '2026-04-06';
const VERSION = { midweekDow: 4, weekendDow: 7 };
const rules = (events) =>
  weekRules({ weekStartISO: WEEK, version: VERSION, events });

/** Which meetings are actually held, in order — the thing both sides answer. */
const held = (r) =>
  ['midweek', 'weekend']
    .filter((k) => !r.isTakenAway(k))
    .map((k) => `${r.dateOf(k)} ${k}`);

const failures = [];
function check(name, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) failures.push(`${name}\n      получено: ${a}\n      ожидалось: ${b}`);
}

check(
  'обычная неделя держит обе встречи',
  held(rules([])),
  ['2026-04-09 midweek', '2026-04-12 weekend'],
);

check(
  'конгресс с пятницы по воскресенье снимает ВСЮ неделю, включая четверг',
  held(
    rules([
      { id: 'c', type: 'regional_convention', date: '2026-04-10', endDate: '2026-04-12' },
    ]),
  ),
  [],
);

check(
  'районное собрание в одну субботу снимает всю неделю',
  held(rules([{ id: 'a', type: 'circuit_assembly', date: '2026-04-11' }])),
  [],
);

check(
  'Вечеря в среду уносит БУДНЮЮ встречу, хотя та в четверг',
  held(rules([{ id: 'm', type: 'memorial', date: '2026-04-08' }])),
  ['2026-04-12 weekend'],
);

check(
  'Вечеря в субботу уносит ВЫХОДНУЮ встречу, хотя та в воскресенье',
  held(rules([{ id: 'm', type: 'memorial', date: '2026-04-11' }])),
  ['2026-04-09 midweek'],
);

check(
  'Вечеря встаёт НА МЕСТО встречи, а не просто прячет её',
  rules([{ id: 'm', type: 'memorial', date: '2026-04-08' }]).replacedBy('midweek')?.id,
  'm',
);

check(
  'Вечеря вне недели не трогает ничего',
  held(rules([{ id: 'm', type: 'memorial', date: '2026-04-15' }])),
  ['2026-04-09 midweek', '2026-04-12 weekend'],
);

check(
  'визит переносит будню встречу на вторник и не трогает выходную',
  held(rules([{ id: 'v', type: 'circuit_overseer_visit', date: '2026-04-06' }])),
  ['2026-04-07 midweek', '2026-04-12 weekend'],
);

check(
  'визит следует дню, записанному на событии',
  rules([
    { id: 'v', type: 'circuit_overseer_visit', date: '2026-04-06', coMidweekDow: 3 },
  ]).dateOf('midweek'),
  '2026-04-08',
);

check(
  'галочка снимает встречу того дня, который событие накрывает',
  held(
    rules([
      { id: 's', type: 'special_talk', date: '2026-04-09', replacesMeeting: true },
    ]),
  ),
  ['2026-04-12 weekend'],
);

check(
  'галочка в субботу НЕ заменяет воскресную встречу — это событие субботы',
  held(
    rules([
      { id: 's', type: 'special_talk', date: '2026-04-11', replacesMeeting: true },
    ]),
  ),
  ['2026-04-09 midweek', '2026-04-12 weekend'],
);

check(
  'галочка без флага не значит ничего',
  held(rules([{ id: 's', type: 'special_talk', date: '2026-04-09' }])),
  ['2026-04-09 midweek', '2026-04-12 weekend'],
);

check(
  'конгресс старше Вечери — уносить уже нечего',
  held(
    rules([
      { id: 'm', type: 'memorial', date: '2026-04-08' },
      { id: 'c', type: 'regional_convention', date: '2026-04-10', endDate: '2026-04-12' },
    ]),
  ),
  [],
);

check(
  'Вечеря с ГАЛОЧКОЙ судится по роду дня, а не дважды',
  held(
    rules([
      { id: 'm', type: 'memorial', date: '2026-04-11', replacesMeeting: true },
    ]),
  ),
  ['2026-04-09 midweek'],
);

if (failures.length > 0) {
  console.error(`Правила недели разошлись — ${failures.length} случаев:\n`);
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  process.exit(1);
}

console.log('OK: week rules agree with the server (14 cases).');
