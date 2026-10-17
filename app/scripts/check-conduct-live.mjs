#!/usr/bin/env node
/**
 * The meeting as it runs, shared between the timekeeper's device and the
 * chairman's (lib/conduct-live.ts), pinned: the clock shift there and back,
 * a state the screen cannot understand, «не на связи», and who taps on which
 * device. Called directly from the gate, never through a new npm script (that
 * block is an input to the Expo fingerprint).
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
const out = mkdtempSync(join(tmpdir(), 'conduct-live-'));
for (const name of ['conduct-live', 'conduct-run-record']) {
  const src = readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  writeFileSync(join(out, `${name}.mjs`), js.replace(/from '\.\/conduct-run-record'/g, "from './conduct-run-record.mjs'"));
}
const L = await import(pathToFileURL(join(out, 'conduct-live.mjs')));
const { EMPTY_RUN } = await import(pathToFileURL(join(out, 'conduct-run-record.mjs')));

let n = 0;
const check = (name, fn) => {
  fn();
  n += 1;
};

const T = Date.UTC(2026, 9, 21, 17, 10);
const running = {
  ...EMPTY_RUN,
  index: 4,
  spent: [60, 600, 590, 250],
  counsel: [null, null, null, 70],
  startedAt: T - 30_000,
  meetingStartedAt: T - 1_700_000,
  pausedSec: 12,
  keys: ['a', 'b', 'c', 'd', 'e'],
  pending: { segments: [], totalSec: 1, plannedSec: 1 },
  saved: true,
  prev: { ...EMPTY_RUN },
};

check('local → server → another device: every moment shifted, durations not', () => {
  const offA = 3_000; // device A is 3 s behind the server
  const offB = -1_500; // device B is 1.5 s ahead
  const wire = L.toWire(running, offA);
  assert.equal(wire.startedAt, running.startedAt + 3_000);
  assert.equal(wire.meetingStartedAt, running.meetingStartedAt + 3_000);
  assert.equal(wire.counselFrom, null);
  assert.equal(wire.pausedSec, 12);
  const onB = L.fromWire(JSON.parse(JSON.stringify(wire)), offB);
  // The same server moment, on B's clock.
  assert.equal(onB.startedAt, running.startedAt + 3_000 + 1_500);
  assert.deepEqual(onB.spent, running.spent);
  assert.deepEqual(onB.counsel, running.counsel);
  assert.deepEqual(onB.keys, running.keys);
});

check('when each part began goes over the wire on the server clock, like every moment', () => {
  const s = { ...running, starts: [T - 1_700_000, null, T - 30_000] };
  const wire = L.toWire(s, 2_000);
  assert.deepEqual(wire.starts, [T - 1_698_000, null, T - 28_000]);
  assert.deepEqual(L.fromWire(JSON.parse(JSON.stringify(wire)), 2_000).starts, s.starts);
  // An older device sends none: an empty list, not a crash.
  const old = { ...wire }; delete old.starts;
  assert.deepEqual(L.fromWire(old, 0).starts, []);
});

check('the device bookkeeping does not go up, and does not come back', () => {
  const wire = L.toWire(running, 0);
  assert.ok(!('prev' in wire) && !('pending' in wire) && !('saved' in wire));
  const back = L.fromWire(wire, 0);
  assert.equal(back.prev, null);
  assert.equal(back.pending, null);
  assert.equal(back.saved, false);
});

check('what the screen cannot read is «not started», never a crash', () => {
  for (const bad of [null, {}, [], 'x', { v: 2, index: 0 }, { v: 1, index: -1 }, { v: 1, index: 1.5 }]) {
    assert.equal(L.fromWire(bad, 0), null, JSON.stringify(bad));
  }
  const odd = L.fromWire({ v: 1, index: 2, spent: ['x', 5], counsel: 'no', startedAt: 'soon', keys: [1, 'k'] }, 0);
  assert.deepEqual(odd.spent, [0, 5]);
  assert.deepEqual(odd.counsel, []);
  assert.equal(odd.startedAt, null);
  assert.deepEqual(odd.keys, ['k']);
});

check('the offset from the sample with the shortest round trip', () => {
  const a = L.offsetSample(1000, 1200, 5100); // rtt 200, offset 4000
  const b = L.offsetSample(2000, 2040, 6050); // rtt 40, offset 4030
  assert.equal(a.offset, 4000);
  assert.equal(L.bestOffset([a, b]), 4030);
  assert.equal(L.bestOffset([]), 0);
});

check('«не на связи» after twenty seconds of silence, on the server clock', () => {
  const seen = new Date(T).toISOString();
  assert.equal(L.isSilent(seen, T + 19_000), false);
  assert.equal(L.isSilent(seen, T + 21_000), true);
  assert.equal(L.isSilent(null, T), true);
});

const roles = (o = {}) => ({
  mayRun: true,
  isChairman: false,
  isTimekeeper: false,
  hasTimekeeper: false,
  timekeeperName: null,
  ...o,
});
const base = { practice: false, canRunLocally: true, answered: true, live: null, localStarted: false };

check('who taps on which device', () => {
  // Nobody runs it yet.
  assert.equal(L.liveMode({ ...base, roles: roles({ isChairman: true }) }), 'run', 'chairman, no timekeeper');
  assert.equal(
    L.liveMode({ ...base, roles: roles({ isChairman: true, hasTimekeeper: true }) }),
    'watch',
    'chairman watches when a timekeeper is named',
  );
  assert.equal(
    L.liveMode({ ...base, roles: roles({ isTimekeeper: true, hasTimekeeper: true }) }),
    'run',
    'the timekeeper starts it',
  );
  assert.equal(
    L.liveMode({ ...base, roles: roles({ isChairman: true, hasTimekeeper: true }), localStarted: true }),
    'run',
    'a device that started counting goes on',
  );
  assert.equal(L.liveMode({ ...base, roles: roles({ mayRun: false }), canRunLocally: false }), 'watch');
  // Somebody runs it.
  assert.equal(L.liveMode({ ...base, roles: roles({ isTimekeeper: true }), live: { mine: false } }), 'watch');
  assert.equal(L.liveMode({ ...base, roles: roles({ isChairman: true }), live: { mine: true } }), 'run');
  // No answer at all: as before Live.
  assert.equal(L.liveMode({ ...base, answered: false, roles: null }), 'run');
  assert.equal(L.liveMode({ ...base, answered: false, roles: null, canRunLocally: false }), 'watch');
  // Practice is always one's own.
  assert.equal(L.liveMode({ ...base, practice: true, roles: roles(), live: { mine: false } }), 'run');
});

check('who oversees how the meeting runs — as on the server (16 October 2026)', () => {
  assert.equal(L.isConductOverseer('admin', []), true);
  assert.equal(L.isConductOverseer('elder', ['adviser']), true, 'the counsel brother');
  assert.equal(L.isConductOverseer('ministerial_servant', ['life_ministry_overseer']), true);
  assert.equal(L.isConductOverseer('elder', []), false, 'an elder as such does not');
  assert.equal(L.isConductOverseer('elder', ['secretary', 'body_coordinator']), false);
  assert.equal(L.isConductOverseer('ministerial_servant', []), false);
  assert.equal(L.isConductOverseer(undefined, new Set()), false);
});

check('a watching screen that cannot be trusted says so (17 October 2026)', () => {
  const ok = { failed: false, lastGoodAtMs: T, nowMs: T + 3000, controllerSilent: false };
  assert.equal(L.watchUnsure(ok), false, 'a fresh answer three seconds ago');
  assert.equal(L.watchUnsure({ ...ok, failed: true }), true, 'the last ask failed');
  assert.equal(L.watchUnsure({ ...ok, nowMs: T + L.LIVE_STALE_MS + 1 }), true, 'an ask still out, nothing new for too long');
  assert.equal(L.watchUnsure({ ...ok, nowMs: T + L.LIVE_STALE_MS }), false, 'right at the limit is still fine');
  assert.equal(L.watchUnsure({ ...ok, controllerSilent: true }), true, 'the running device went silent');
  assert.equal(L.watchUnsure({ ...ok, lastGoodAtMs: 0 }), true, 'never had a good answer');
  // A hung ask must fail before the screen calls itself stale, or the next
  // ask never goes out: the library waits for the one still out.
  assert.ok(L.LIVE_REQUEST_TIMEOUT_MS < L.LIVE_STALE_MS);
  assert.ok(L.LIVE_STALE_MS > 2 * L.LIVE_POLL_MS, 'one missed ask alone does not grey the screen');
});

console.log(`conduct-live: ${n} groups ok`);
