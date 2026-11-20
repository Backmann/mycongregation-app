#!/usr/bin/env node
/**
 * «Проверка недели» (lib/week-check.ts, 20 November 2026), held to examples:
 * an empty student part closer than three weeks is «late» (guidelines п. 24),
 * further — just empty; a person away on the meeting's day; a student part
 * not yet sent out within three weeks; the same pair again; a midweek meeting
 * longer than 1 h 45 min (п. 20); one person on two parts of a meeting. What
 * is empty is the SERVER's list — the same count as the «N из M» badge.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'week-check-'));
for (const name of ['meeting-guidelines', 'picker-rank', 'week-check'])
  writeFileSync(
    join(out, `${name}.mjs`),
    ts
      .transpileModule(readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/from '\.\/([a-z-]+)'/g, "from './$1.mjs'"),
  );
const C = await import(pathToFileURL(join(out, 'week-check.mjs')));

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

const W = '2026-11-23';
const row = (id, partKey, extra = {}) => ({
  id,
  eventType: 'midweek',
  partKey,
  partTitle: partKey === 'apply_yourself_1' ? 'Начинайте разговор' : null,
  publisherId: null,
  assistantPublisherId: null,
  status: 'published',
  weekStartDate: W,
  ...extra,
});
const run = (rows, extra = {}) =>
  C.checkWeek({
    rows,
    missing: { midweek: [], weekend: [] },
    dates: { midweek: '2026-11-25', weekend: '2026-11-29' },
    today: '2026-11-20',
    absent: { midweek: new Set(), weekend: new Set() },
    itemsOf: () => [],
    midweekMinutes: 105,
    ...extra,
  });
const kinds = (xs) => xs.map((x) => x.kind);

check('пустая учебная часть за 5 дней — «поздно»', kinds(run([row('r', 'bible_reading')], { missing: { midweek: ['bible_reading'], weekend: [] } })), ['late']);
check('пустая учебная часть за 6 недель — просто пустая', kinds(run([row('r', 'bible_reading')], { today: '2026-10-10', missing: { midweek: ['bible_reading'], weekend: [] } })), ['empty']);
check('пустая не-учебная — просто пустая', kinds(run([row('r', 'midweek_chairman')], { missing: { midweek: ['midweek_chairman'], weekend: [] } })), ['empty']);
check('то, чего нет в списке сервера, не пустое (часть районного и т. п.)', kinds(run([row('r', 'co_service_talk')])), []);
check('в отъезде в день встречи', kinds(run([row('r', 'bible_reading', { publisherId: 'p' })], { absent: { midweek: new Set(['p']), weekend: new Set() } })), ['away']);
check('учебная часть не разослана за 5 дней', kinds(run([row('r', 'bible_reading', { publisherId: 'p', status: 'draft' })])), ['unsent']);
check('черновик за 6 недель — не тревога', kinds(run([row('r', 'bible_reading', { publisherId: 'p', status: 'draft' })], { today: '2026-10-10' })), []);
check(
  'та же пара за полгода',
  run([row('r', 'apply_yourself_1', { publisherId: 'm', assistantPublisherId: 'n' })], {
    itemsOf: (id) =>
      id === 'm'
        ? [{ weekStartDate: '2026-09-14', eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_1', partTitle: 'Начинайте разговор', role: 'primary', assignmentId: 'old', partnerId: 'n' }]
        : [],
  }).map((x) => [x.kind, x.week]),
  [['pair', '2026-09-14']],
);
check(
  'сама часть — не повтор пары',
  kinds(run([row('r', 'apply_yourself_1', { publisherId: 'm', assistantPublisherId: 'n' })], {
    itemsOf: () => [{ weekStartDate: W, eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_1', partTitle: 'Начинайте разговор', role: 'primary', assignmentId: 'r', partnerId: 'n' }],
  })),
  [],
);
check('109 минут — дольше указаний', kinds(run([], { midweekMinutes: 109 })), ['long']);
check('105 минут — в пределах', kinds(run([], { midweekMinutes: 105 })), []);
check('два пункта у одного — сказано', kinds(run([row('a', 'midweek_chairman', { publisherId: 'p' }), row('b', 'cbs_conductor', { publisherId: 'p' })])), ['double']);
check('отменённая часть не в счёт', kinds(run([row('a', 'midweek_chairman', { publisherId: 'p' }), row('b', 'cbs_conductor', { publisherId: 'p', status: 'cancelled' })])), []);
check(
  'порядок: поздно, пусто, отъезд, не разослано, пара, время, два пункта',
  kinds(
    run(
      [
        row('a', 'midweek_chairman', { publisherId: 'x' }),
        row('b', 'cbs_conductor', { publisherId: 'x' }),
        row('c', 'bible_reading'),
        row('d', 'apply_yourself_2', { partTitle: 'Развивайте интерес', publisherId: 'y', status: 'draft' }),
        row('e', 'midweek_opening_prayer'),
      ],
      { missing: { midweek: ['bible_reading', 'midweek_opening_prayer'], weekend: [] }, midweekMinutes: 110, absent: { midweek: new Set(['y']), weekend: new Set() } },
    ),
  ),
  ['late', 'empty', 'away', 'unsent', 'long', 'double'],
);

check('много пустых — одна строка на встречу', run(['a','b','c','d','e'].map((x) => row(x, `midweek_part_${x}`)), { today: '2026-10-10', missing: { midweek: ['midweek_part_a','midweek_part_b','midweek_part_c','midweek_part_d','midweek_part_e'], weekend: [] } }).map((x) => [x.kind, x.count]), [['emptyMany', 5]]);
check('три пустых — по строке', kinds(run(['a','b','c'].map((x) => row(x, `midweek_part_${x}`)), { today: '2026-10-10', missing: { midweek: ['midweek_part_a','midweek_part_b','midweek_part_c'], weekend: [] } })), ['empty','empty','empty']);
check('в отъезде с двумя частями — одна строка', run([row('a', 'midweek_chairman', { publisherId: 'p' }), row('b', 'cbs_conductor', { publisherId: 'p' })], { absent: { midweek: new Set(['p']), weekend: new Set() } }).filter((x) => x.kind === 'away').map((x) => x.rows.length), [2]);

const edit = readFileSync(join(ROOT, 'app/(app)/schedule/edit.tsx'), 'utf8');
check('экран недели показывает проверку', edit.includes('<WeekCheck'), true);
console.log(`${failures ? '✗' : '✓'} проверка недели: ${passed} проверок${failures ? `, ошибок ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
