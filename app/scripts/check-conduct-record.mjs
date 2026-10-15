#!/usr/bin/env node
/**
 * The chairman's run as kept on the device, pinned (lib/conduct-run-record.ts).
 *
 * On 14 October 2026 the record changed shape and the screen did not notice:
 * a run still going showed «Начать встречу» over a running clock, and one tap
 * on it wiped the meeting. These cases are every shape the screen has ever
 * written, and the ways a programme can change under a meeting that is
 * running. Called directly from the gate, never through a new npm script
 * (that block is an input to the Expo fingerprint).
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
const out = mkdtempSync(join(tmpdir(), 'conduct-record-'));
const src = readFileSync(join(ROOT, 'lib', 'conduct-run-record.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'conduct-run-record.mjs'), js);
const { readRunRecord, writeRunRecord, reconcileKeys, EMPTY_RUN, LEGACY_LIVE_MS } = await import(
  pathToFileURL(join(out, 'conduct-run-record.mjs'))
);

const NOW = Date.UTC(2026, 9, 14, 17, 40); // a Wednesday evening, mid-meeting
const KEYS = [
  'midweek_opening_prayer',
  'treasures_talk',
  'spiritual_gems',
  'bible_reading',
  'apply_yourself_1',
  'apply_yourself_2',
  'mid_song',
  'living_christians_1',
  'cbs_conductor',
  'midweek_closing_prayer',
];

let failed = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

// ---------------------------------------------------------------- reading

it('nothing kept → an empty run', () => {
  const r = readRunRecord(null, KEYS, NOW);
  assert.equal(r.verdict, 'none');
  assert.deepEqual(r.state, EMPTY_RUN);
});

for (const raw of ['{', '[]', '"x"', '{"foo":1}', '{"index":"2","spent":[]}']) {
  it(`unreadable ${raw} → dropped`, () => {
    assert.equal(readRunRecord(raw, KEYS, NOW).verdict, 'unreadable');
  });
}

// The record behind the 14 October bug: v1, three parts done, the fourth
// running for 2½ minutes.
const v1Live = { index: 3, spent: [300, 610, 590], startedAt: NOW - 150_000, carried: 0 };

it('v1 of a running meeting → carried on, NOT «Начать встречу»', () => {
  const r = readRunRecord(JSON.stringify(v1Live), KEYS, NOW);
  assert.equal(r.verdict, 'legacy-continued');
  const s = r.state;
  assert.notEqual(s.meetingStartedAt, null, 'the screen shows «Начать встречу» when this is null');
  assert.equal(s.index, 3);
  assert.equal(s.startedAt, v1Live.startedAt, 'the running part keeps its clock');
  assert.deepEqual(s.spent, [300, 610, 590]);
  assert.deepEqual(s.counsel, [null, null, null]);
  assert.equal(s.meetingStartedAt, v1Live.startedAt - 1500 * 1000);
  assert.deepEqual(s.keys, KEYS);
  assert.deepEqual(s.legacyKeys, KEYS.slice(0, 3));
  assert.equal(s.finishedAt, null);
});

it('v1 paused part keeps its carried seconds in the meeting start', () => {
  const r = readRunRecord(JSON.stringify({ ...v1Live, carried: 40 }), KEYS, NOW);
  assert.equal(r.state.meetingStartedAt, v1Live.startedAt - 1540 * 1000);
});

const dropped = {
  'v1 started more than 3 hours ago': { ...v1Live, startedAt: NOW - LEGACY_LIVE_MS - 1 },
  'v1 finished (no part running)': { index: KEYS.length, spent: KEYS.map(() => 60), startedAt: null, carried: 0 },
  'v1 paused (no time to judge it by)': { index: 2, spent: [300, 600], startedAt: null, carried: 50 },
  'v1 from the future': { ...v1Live, startedAt: NOW + 60_000 },
  'v1 past the last part of this programme': { ...v1Live, index: KEYS.length },
};
for (const [name, rec] of Object.entries(dropped)) {
  it(`${name} → dropped`, () => {
    const r = readRunRecord(JSON.stringify(rec), KEYS, NOW);
    assert.equal(r.verdict, 'legacy-dropped');
    assert.deepEqual(r.state, EMPTY_RUN);
  });
}

it('a9272fb record (v2 without a version) → current, keys taken from the screen', () => {
  const rec = {
    index: 2, spent: [301, 598], counsel: [null, null], startedAt: NOW - 60_000, carried: 0,
    counselFrom: null, meetingStartedAt: NOW - 960_000, pausedSec: 0, pausedAt: null,
    finishedAt: null, saved: false, prev: null,
  };
  const r = readRunRecord(JSON.stringify(rec), KEYS, NOW);
  assert.equal(r.verdict, 'current');
  assert.equal(r.state.meetingStartedAt, rec.meetingStartedAt);
  assert.deepEqual(r.state.keys, KEYS);
  assert.deepEqual(r.state.legacyKeys, []);
  assert.equal(r.state.changed, null);
});

it('v2 written and read back is the same run', () => {
  const s = {
    ...EMPTY_RUN, index: 4, spent: [300, 600, 610, 245], counsel: [null, null, null, 61],
    startedAt: NOW - 30_000, meetingStartedAt: NOW - 1900_000, keys: KEYS,
    legacyKeys: ['midweek_opening_prayer'], changed: { added: ['apply_yourself_2'], removed: [] },
  };
  const raw = writeRunRecord(s);
  assert.equal(JSON.parse(raw).v, 2);
  const r = readRunRecord(raw, KEYS, NOW);
  assert.equal(r.verdict, 'current');
  assert.deepEqual(r.state, s);
});

it('v2 not started → still not started', () => {
  const r = readRunRecord(writeRunRecord(EMPTY_RUN), KEYS, NOW);
  assert.equal(r.verdict, 'current');
  assert.equal(r.state.meetingStartedAt, null);
  assert.equal(r.state.keys, null);
});

// ---------------------------------------------------------- reconciling

const K = ['a', 'b', 'c', 'd'];
const running = {
  ...EMPTY_RUN, index: 2, spent: [10, 20], counsel: [null, 60], startedAt: NOW - 5_000,
  meetingStartedAt: NOW - 100_000, keys: K, prev: { ...EMPTY_RUN },
};

it('not started → the same object back', () => {
  assert.equal(reconcileKeys(EMPTY_RUN, ['x'], NOW), EMPTY_RUN);
});

it('same keys → the same object back (nothing written)', () => {
  assert.equal(reconcileKeys(running, [...K], NOW), running);
});

it('a part added BEFORE the running one: the running part stays running', () => {
  const n = reconcileKeys(running, ['a', 'x', 'b', 'c', 'd'], NOW);
  assert.equal(n.index, 3);
  assert.equal(n.startedAt, running.startedAt);
  assert.deepEqual(n.spent, [10, 0, 20]);
  assert.deepEqual(n.counsel, [null, null, 60]);
  assert.deepEqual(n.changed, { added: ['x'], removed: [] });
  assert.equal(n.prev, null, '«Вернуть» must not bring back positions of a programme that is gone');
});

it('a part added AFTER the running one: positions unchanged', () => {
  const n = reconcileKeys(running, ['a', 'b', 'c', 'x', 'd'], NOW);
  assert.equal(n.index, 2);
  assert.deepEqual(n.spent, [10, 20]);
  assert.deepEqual(n.changed, { added: ['x'], removed: [] });
});

it('a finished part removed: its seconds go, the running part stays', () => {
  const n = reconcileKeys(running, ['a', 'c', 'd'], NOW);
  assert.equal(n.index, 1);
  assert.deepEqual(n.spent, [10]);
  assert.deepEqual(n.changed, { added: [], removed: ['b'] });
});

it('the running part removed: the next part that is left runs on the same clock', () => {
  const n = reconcileKeys(running, ['a', 'b', 'd'], NOW);
  assert.equal(n.index, 2);
  assert.equal(n.startedAt, running.startedAt);
  assert.deepEqual(n.changed, { added: [], removed: ['c'] });
});

it('the running part and everything after it removed: the meeting is over', () => {
  const n = reconcileKeys(running, ['a', 'b'], NOW);
  assert.equal(n.index, 2);
  assert.equal(n.finishedAt, NOW);
  assert.equal(n.startedAt, null);
});

it('a finished meeting re-laid: index = all parts, a new part has 0 s', () => {
  const fin = { ...running, index: 4, spent: [10, 20, 30, 40], counsel: [null, 60, null, null], startedAt: null, finishedAt: NOW - 1000 };
  const n = reconcileKeys(fin, ['a', 'b', 'x', 'c', 'd'], NOW);
  assert.equal(n.index, 5);
  assert.deepEqual(n.spent, [10, 20, 0, 30, 40]);
  assert.equal(n.finishedAt, fin.finishedAt);
});

it('during the counsel minute a part slips in between: the minute ends, the part starts now', () => {
  const inCounsel = { ...running, counselFrom: NOW - 20_000, startedAt: NOW + 40_000, counsel: [null, 60] };
  const n = reconcileKeys(inCounsel, ['a', 'b', 'x', 'c', 'd'], NOW);
  assert.equal(n.index, 3);
  assert.equal(n.counselFrom, null);
  assert.equal(n.startedAt, NOW);
  assert.equal(n.counsel[1], 20, 'the counsel that was given is what is counted');
});

it('during the counsel minute an unrelated change: the minute goes on', () => {
  const inCounsel = { ...running, counselFrom: NOW - 20_000, startedAt: NOW + 40_000 };
  const n = reconcileKeys(inCounsel, ['a', 'b', 'c', 'd', 'x'], NOW);
  assert.equal(n.counselFrom, inCounsel.counselFrom);
  assert.equal(n.startedAt, inCounsel.startedAt);
});

it('two changes in a row add up, and v1 parts that are gone lose the v1 mark', () => {
  const s = { ...running, legacyKeys: ['a', 'b'] };
  const n1 = reconcileKeys(s, ['a', 'b', 'c', 'd', 'x'], NOW);
  const n2 = reconcileKeys(n1, ['b', 'c', 'd', 'x'], NOW);
  assert.deepEqual(n2.changed, { added: ['x'], removed: ['a'] });
  assert.deepEqual(n2.legacyKeys, ['b']);
});

it('a run with no keys yet adopts the programme on screen', () => {
  const s = { ...running, keys: null };
  const n = reconcileKeys(s, K, NOW);
  assert.deepEqual(n.keys, K);
  assert.equal(n.changed, null);
});

// ------------------------------------------------------------------ run

for (const [name, fn] of cases) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${String(e.message).split('\n').join('\n  ')}`);
  }
}
if (failed) {
  console.error(`\nЗапись хода встречи: ${failed} из ${cases.length} не сходятся`);
  process.exit(1);
}
console.log(`✓ Запись хода встречи: ${cases.length} случаев`);
