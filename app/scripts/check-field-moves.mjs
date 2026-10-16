#!/usr/bin/env node
/**
 * A moved field-service meeting says so on both days (lib/field-moves.ts,
 * 16 October 2026), pinned: the stand-in on the old day, only while that day
 * is to come; never for a cancelled or never-moved meeting; and it counts as
 * a meeting that does not hold. Called directly from the gate, never through
 * a new npm script (that block is an input to the Expo fingerprint).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'field-moves-'));
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib', 'field-moves.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'field-moves.mjs'), js);
const M = await import(pathToFileURL(join(out, 'field-moves.mjs')));

const TODAY = '2026-10-16';
// Moved from Sat 24 Oct to Sat 31 Oct.
const moved = { id: 'm1', weekStartDate: '2026-10-26', dayOfWeek: 6, movedFromDate: '2026-10-24', cancelledAt: null };
let n = 0;
const check = (name, fn) => {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`✗ ${name}\n  ${String(e.message).split('\n').join('\n  ')}`);
    process.exitCode = 1;
  }
};

check('the old day gets a stand-in that says where it went, and counts as not held', () => {
  const list = M.withMoveStandIns([moved], TODAY);
  assert.equal(list.length, 2);
  const stand = list[1];
  assert.equal(M.dateOfMeeting(stand), '2026-10-24');
  assert.equal(stand.movedTo, '2026-10-31');
  assert.ok(stand.cancelledAt, 'everything that counts meetings that hold leaves it out');
  assert.equal(stand.id, 'm1', 'it opens the meeting itself');
  assert.equal(M.rowKey(stand), 'm1:moved');
  assert.equal(M.rowKey(moved), 'm1');
});

check('the new day says where it came from, while the old day is to come', () => {
  assert.equal(M.movedFromShown(moved, TODAY), '2026-10-24');
  assert.equal(M.movedFromShown(moved, '2026-10-25'), null, 'the old day has passed');
});

check('no stand-in once the old day has passed, or outside the asked span', () => {
  assert.equal(M.withMoveStandIns([moved], '2026-10-25').length, 1);
  assert.equal(M.withMoveStandIns([moved], TODAY, '2026-10-26', '2026-11-30').length, 1);
  assert.equal(M.withMoveStandIns([moved], TODAY, '2026-10-19', '2026-10-26').length, 2);
});

check('a cancelled meeting, one never moved, and a stand-in itself get none', () => {
  assert.equal(M.withMoveStandIns([{ ...moved, cancelledAt: '2026-10-15' }], TODAY).length, 1);
  assert.equal(M.withMoveStandIns([{ ...moved, movedFromDate: null }], TODAY).length, 1);
  const once = M.withMoveStandIns([moved], TODAY);
  assert.equal(M.withMoveStandIns(once, TODAY).length, 2, 'applied twice adds nothing');
  assert.equal(M.movedFromShown({ ...moved, cancelledAt: 'x' }, TODAY), null);
});

check('a Sunday old day lands on its own week', () => {
  const sun = { ...moved, movedFromDate: '2026-10-25' };
  const stand = M.withMoveStandIns([sun], TODAY)[1];
  assert.equal(stand.weekStartDate, '2026-10-19');
  assert.equal(stand.dayOfWeek, 7);
});

if (process.exitCode) process.exit(1);
console.log(`✓ Перенос встречи для проповеди: ${n} проверок`);
