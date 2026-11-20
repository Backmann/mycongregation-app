#!/usr/bin/env node
/**
 * «Учебные на месяц» (lib/student-month.ts, 20 November 2026), held to
 * examples: the rows are the student parts in their order, a discussion gets
 * no student checks, a pair seen within 26 weeks is told with its week, the
 * same person in the week before or after is told — and the screen exists,
 * is reachable and opens the part in the same window.
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'student-month-'));
for (const name of ['meeting-guidelines', 'picker-rank', 'student-month'])
  writeFileSync(
    join(out, `${name}.mjs`),
    ts
      .transpileModule(readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/from '\.\/([a-z-]+)'/g, "from './$1.mjs'"),
  );
const M = await import(pathToFileURL(join(out, 'student-month.mjs')));

let failures = 0;
let passed = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
};

const W = ['2026-11-23', '2026-11-30', '2026-12-07'];
const row = (id, week, partKey, extra = {}) => ({
  id, weekStartDate: week, eventType: 'midweek', partKey,
  partTitle: partKey === 'bible_reading' ? 'Чтение Библии' : 'Начинайте разговор: Служение по домам.',
  publisherId: null, assistantPublisherId: null, status: 'draft', ...extra,
});
const rows = [
  row('r1', W[0], 'bible_reading', { publisherId: 'b1' }),
  row('r2', W[1], 'bible_reading', { publisherId: 'b1' }),
  row('a1', W[0], 'apply_yourself_1', { publisherId: 's1', assistantPublisherId: 's2' }),
  row('a2', W[1], 'apply_yourself_1'),
  row('d3', W[0], 'apply_yourself_3', { partTitle: 'Что бы вы сказали?: Обсуждение.', publisherId: 'e1' }),
  row('x1', W[2], 'apply_yourself_1', { status: 'cancelled', publisherId: 's1' }),
  row('w1', W[0], 'cbs_reader', { publisherId: 'b1' }),
  row('out', '2027-01-04', 'bible_reading', { publisherId: 'b1' }),
];
// History as the pickers read it: the parts of the table and earlier ones.
const history = {
  b1: [
    { weekStartDate: W[0], eventType: 'midweek', kind: 'part', partKey: 'bible_reading', role: 'primary', assignmentId: 'r1' },
    { weekStartDate: W[1], eventType: 'midweek', kind: 'part', partKey: 'bible_reading', role: 'primary', assignmentId: 'r2' },
  ],
  s1: [
    { weekStartDate: W[0], eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_1', partTitle: 'Начинайте разговор', role: 'primary', assignmentId: 'a1', partnerId: 's2' },
    { weekStartDate: '2026-09-14', eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_2', partTitle: 'Развивайте интерес', role: 'primary', assignmentId: 'old', partnerId: 's2' },
    { weekStartDate: '2025-11-03', eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_2', partTitle: 'Развивайте интерес', role: 'primary', assignmentId: 'older', partnerId: 's2' },
  ],
  s2: [], e1: [
    { weekStartDate: W[1], eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_3', partTitle: 'Что бы вы сказали?: Обсуждение.', role: 'primary', assignmentId: 'd4' },
  ],
};
const m = M.studentMonth(W, rows, (id) => history[id] ?? []);
check('rows: student parts in their order, others and other weeks left out', m.lines.map((l) => [l.partKey, l.number]),
  [['bible_reading', 3], ['apply_yourself_1', 4], ['apply_yourself_3', 6]]);
const cell = (k, w) => m.lines.find((l) => l.partKey === k)?.cells.get(w);
check('two weeks running is told in both weeks', [cell('bible_reading', W[0]).flags, cell('bible_reading', W[1]).flags],
  [[{ kind: 'twoInRow', personId: 'b1' }], [{ kind: 'twoInRow', personId: 'b1' }]]);
check('a pair within 26 weeks is told with its week; older not', cell('apply_yourself_1', W[0]).flags,
  [{ kind: 'pairBefore', week: '2026-09-14' }]);
check('an empty part is empty', [cell('apply_yourself_1', W[1]).empty, cell('apply_yourself_1', W[1]).flags], [true, []]);
check('a cancelled part is not shown', cell('apply_yourself_1', W[2]), undefined);
check('a discussion: no student checks', [cell('apply_yourself_3', W[0]).student, cell('apply_yourself_3', W[0]).flags], [false, []]);
// A pair only older than 26 weeks, and a part two weeks away: neither is told.
{
  const W2 = ['2026-11-23', '2026-11-30', '2026-12-07'];
  const rows2 = [
    row('p1', W2[0], 'apply_yourself_1', { publisherId: 'q1', assistantPublisherId: 'q2' }),
    row('p2', W2[2], 'apply_yourself_2', { partTitle: 'Развивайте интерес', publisherId: 'q1' }),
  ];
  const h2 = {
    q1: [
      { weekStartDate: '2025-11-03', eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_2', partTitle: 'Развивайте интерес', role: 'primary', assignmentId: 'older', partnerId: 'q2' },
      { weekStartDate: W2[0], eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_1', partTitle: 'Начинайте разговор', role: 'primary', assignmentId: 'p1', partnerId: 'q2' },
      { weekStartDate: W2[2], eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_2', partTitle: 'Развивайте интерес', role: 'primary', assignmentId: 'p2' },
    ],
  };
  const m2 = M.studentMonth(W2, rows2, (id) => h2[id] ?? []);
  check('a pair older than 26 weeks is not told', m2.lines[0].cells.get(W2[0]).flags, []);
  check('a part two weeks away is not «two weeks running»', m2.lines[1].cells.get(W2[2]).flags, []);
}
check('heading of a title', M.partHeading('Начинайте разговор: Служение по домам. (lmd)'), 'Начинайте разговор');
check('heading without a note', M.partHeading('Речь'), 'Речь');

const screenPath = join(ROOT, 'app/(app)/schedule/students.tsx');
const screen = existsSync(screenPath) ? readFileSync(screenPath, 'utf8') : '';
check('the screen builds the table from this rule', screen.includes('studentMonth('), true);
check('a cell opens the same part window, beside the week on a computer', /<AssignmentSheet[\s\S]{0,40}panel/.test(screen) && screen.includes('programmeLayout('), true);
const layout = readFileSync(join(ROOT, 'app/(app)/schedule/_layout.tsx'), 'utf8');
check('the screen is in the programme stack and in its menu', layout.includes('name="students"') && layout.includes("'/schedule/students'"), true);
check('who may open it is said', readFileSync(join(ROOT, 'lib/screen-access.ts'), 'utf8').includes("'/schedule/students':"), true);

console.log(`${failures ? '✗' : '✓'} учебные на месяц: ${passed} проверок${failures ? `, ошибок ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
