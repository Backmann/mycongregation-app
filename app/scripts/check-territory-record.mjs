/**
 * A line of the S-13 by hand (lib/territory-record.ts, 17 November 2026):
 * the sheet says what the server would refuse — before the previous service
 * year, two lines over each other, the future, an end before the start —
 * and lets through a line that starts the day the one before it ended.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-trecord-'));
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
try {
  const src = readFileSync(join(ROOT, 'lib', 'territory-record.ts'), 'utf8');
  writeFileSync(
    join(out, 'tr.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText,
  );
  const { keptFromOf, recordProblem, neighboursOf, transferDue } = await import(pathToFileURL(join(out, 'tr.mjs')));
  check('kept from, autumn', keptFromOf('2026-11-17'), '2025-09-01');
  check('kept from, 1 September', keptFromOf('2026-09-01'), '2025-09-01');
  check('kept from, summer', keptFromOf('2026-08-31'), '2024-09-01');

  const today = '2026-11-17';
  const kept = '2025-09-01';
  const line = (id, a, c = null, r = null) => ({ id, holderName: id, assignedOn: a, completedOn: c, returnedOn: r });
  const rows = [line('A', '2025-09-04', '2025-12-19'), line('B', '2026-06-28', null, '2026-10-02'), line('C', '2026-10-02')];
  const P = (d, by = 'start', others = rows) => {
    const p = recordProblem(d, others, today, kept, by);
    return p ? (p.kind === 'over' ? `over ${p.with.id}` : p.kind) : null;
  };
  check('fits between', P({ assignedOn: '2026-01-03', endedOn: '2026-05-11' }), null);
  check('starts the day the one before ended', P({ assignedOn: '2025-12-19', endedOn: '2026-01-01' }), null);
  check('ends the day the next starts', P({ assignedOn: '2026-05-01', endedOn: '2026-06-28' }), null);
  check('lies over the one after', P({ assignedOn: '2026-05-01', endedOn: '2026-07-02' }), 'over B');
  check('still held while another is', P({ assignedOn: '2026-01-03', endedOn: null }), 'over B');
  check('too old (paper starts before the kept years)', P({ assignedOn: '2025-08-20', endedOn: '2025-08-30' }), 'tooOld');
  check('too old (a correction ending before them)', P({ assignedOn: '2025-08-01', endedOn: '2025-08-30' }, 'end', []), 'tooOld');
  check('a correction may start before them if it ends inside', P({ assignedOn: '2025-08-01', endedOn: '2025-09-03' }, 'end', []), null);
  check('future', P({ assignedOn: '2026-11-18', endedOn: null }, 'start', []), 'future');
  check('ends before it starts', P({ assignedOn: '2026-03-01', endedOn: '2026-02-01' }, 'start', []), 'endBeforeStart');
  check('nothing chosen yet', P({ assignedOn: '', endedOn: null }), null);
  const add = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  check('hand on, due later, kept: nothing sent', transferDue('2027-02-02', '2026-11-17', false, add, 122),
    { keep: '2027-02-02', dueOn: '2027-02-02' });
  check('hand on, due later, renewed', transferDue('2027-02-02', '2026-11-17', true, add, 122),
    { keep: '2027-02-02', dueOn: '2027-03-19', send: '2027-03-19' });
  check('hand on an overdue territory: a new day is sent', transferDue('2026-11-01', '2026-11-17', false, add, 122),
    { keep: null, dueOn: '2027-03-19', send: '2027-03-19' });
  check('hand on with no day due', transferDue(null, '2026-11-17', false, add, 122),
    { keep: null, dueOn: '2027-03-19', send: '2027-03-19' });
  const n = neighboursOf(rows[1], [rows[2], rows[0], rows[1]]);
  check('neighbours', [n.before?.id, n.after?.id], ['A', 'C']);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`check-territory-record: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`check-territory-record: ${passed} passed`);
