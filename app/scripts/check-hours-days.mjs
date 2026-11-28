#!/usr/bin/env node
/**
 * Which days an hours entry may go to (28 November 2026): lib/hours-days.ts,
 * run against the month change as it was walked on the stand.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'hours-days-'));
const src = readFileSync(join(ROOT, 'lib', 'hours-days.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'hours-days.mjs'), js);
const { sheetDays, dayProblem, unsentInMonth } = await import(
  pathToFileURL(join(out, 'hours-days.mjs')).href
);

let bad = 0;
const same = (got, want, why) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    bad += 1;
    console.error(`✗ ${why}\n    получено ${JSON.stringify(got)}\n    ожидалось ${JSON.stringify(want)}`);
  }
};

// 1 December, the November screen: November's own last days, never «Сегодня».
same(
  sheetDays('2026-12-01', '2026-11', ['2026-12', '2026-11']),
  { past: true, first: '2026-11-30', second: '2026-11-29', secondShown: true },
  'лист над ноябрём 1 декабря предлагает 30 и 29 ноября',
);
// 1 December on Home: today and yesterday while November is open.
same(
  sheetDays('2026-12-01', '2026-12', ['2026-12', '2026-11']),
  { past: false, first: '2026-12-01', second: '2026-11-30', secondShown: true },
  'Главная 1 декабря: «Сегодня» и «Вчера» (ноябрь открыт)',
);
// November's report is in: «Вчера» (30 November) is not offered.
same(
  sheetDays('2026-12-01', '2026-12', ['2026-12']),
  { past: false, first: '2026-12-01', second: '2026-11-30', secondShown: false },
  'после сдачи ноябрьского отчёта «Вчера» не предлагается',
);
// …unless it is the day of the entry being changed.
same(
  sheetDays('2026-12-01', '2026-12', ['2026-12'], '2026-11-30').secondShown,
  true,
  'изменяемая запись своего дня не теряет',
);
// February, a leap year.
same(sheetDays('2028-03-02', '2028-02', ['2028-03', '2028-02']).first, '2028-02-29', 'конец февраля високосного года');
same(dayProblem('2026-12-28', '2026-12-21', ['2026-12']), 'future', 'будущий день');
same(dayProblem('2026-11-30', '2026-12-21', ['2026-12']), 'closed', 'закрытый месяц');
same(dayProblem('2026-12-21', '2026-12-21', ['2026-12']), null, 'сегодня можно');
same(dayProblem('2026-11-30', '2026-12-01', undefined), null, 'открытые месяцы неизвестны — решает сервер');
same(
  unsentInMonth(
    [
      { type: 'put', body: { day: '2026-11-30' } },
      { type: 'put', body: { day: '2026-12-01' } },
      { type: 'delete' },
    ],
    '2026-11',
  ),
  1,
  'неотправленные записи месяца для отчёта',
);

if (bad) {
  console.error(`\n${bad} проверок учёта часов не прошли.`);
  process.exit(1);
}
console.log('OK: дни записи часов — переход месяца, сданный отчёт, будущий день.');
