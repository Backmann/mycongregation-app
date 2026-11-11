/**
 * The S-13 laid out as the form (lib/s13.ts, 11 November 2026): the order of
 * the lines, the day last worked, carried-over and returned assignments, the
 * fifth assignment on a new line, groups, campaigns, one surname for two
 * people, twenty lines a sheet. Invented names only.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');

const out = mkdtempSync(join(ROOT, '.check-s13-'));
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}

try {
  const src = readFileSync(join(ROOT, 'lib', 's13.ts'), 'utf8');
  writeFileSync(
    join(out, 's13.mjs'),
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  const S = await import(pathToFileURL(join(out, 's13.mjs')));
  const W = { group: 'Гр.', campaign: 'кампания' };
  const a = (holderName, assignedOn, completedOn = null, extra = {}) => ({
    holderName,
    forGroupName: null,
    assignedOn,
    completedOn,
    method: completedOn ? 'door_to_door' : null,
    ...extra,
  });

  check('a day in the form\'s short shape', S.shortDay('2026-09-03'), '03.09.26');
  check('no day, empty cell', S.shortDay(null), '');
  check('«Группа 2» shortened', S.shortGroup('Группа 2', 'Гр.'), 'Гр. 2');
  check('another group name kept', S.shortGroup('Северная', 'Гр.'), 'Северная');

  const lines = S.s13Lines(
    {
      serviceYear: 2027,
      territories: [
        { number: 'T10', lastCompletedBefore: null, assignments: [] },
        {
          number: 'T2',
          lastCompletedBefore: '2026-06-01',
          assignments: [
            a('Белова Анна', '2026-08-20'), // carried over, still out
          ],
        },
        {
          number: 'T1',
          lastCompletedBefore: null,
          assignments: [
            a('Белова Вера', '2026-09-02', '2026-10-01'),
            a('Гусев Олег', '2026-10-05', null, { forGroupName: 'Группа 2' }),
            a('Гусев Олег', '2026-11-01', '2026-11-01', { method: 'campaign' }),
            a('Орлов Иван', '2026-11-05'),
            a('Орлов Иван', '2026-12-01', '2026-12-20'),
          ],
        },
      ],
    },
    W,
  );
  check(
    'lines in the order of the numbers, the fifth assignment on its own line',
    lines.map((l) => [l.number, l.last, l.cells.length]),
    [
      ['T1', '', 4],
      ['T1', '', 1],
      ['T2', '01.06.26', 1],
      ['T10', '', 0],
    ],
  );
  check(
    'one surname for two people gets initials; a group and a campaign are marked',
    lines[0].cells.map((c) => c.name),
    ['Белова В.', 'Гр. 2 · Гусев', 'Гусев (кампания)', 'Орлов'],
  );
  check('carried over: its old day, nothing worked yet', lines[2].cells[0], {
    name: 'Белова А.',
    received: '20.08.26',
    worked: '',
  });
  check('handed back: the worked cell stays empty', lines[0].cells[1].worked, '');

  const many = S.s13Lines(
    {
      serviceYear: 2027,
      territories: Array.from({ length: 41 }, (_, i) => ({
        number: `A${i + 1}`,
        lastCompletedBefore: null,
        assignments: [],
      })),
    },
    W,
  );
  check(
    'twenty lines a sheet',
    S.s13Sheets(many).map((s) => s.length),
    [20, 20, 1],
  );
  check('an empty year is still one sheet', S.s13Sheets([]).length, 1);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n✗ S-13: ${failures} of ${failures + passed} checks failed.`);
  process.exit(1);
}
console.log(`OK: S-13 as the form (${passed} checks).`);
