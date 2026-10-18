#!/usr/bin/env node
/**
 * The chairman's screen at the lectern (lib/conduct-stage.ts), pinned
 * (18 October 2026): when the countdown turns amber, the time to the start,
 * and «Проверить экран» — that it shows every state of every part and ends.
 * Called directly from the gate, never through a new npm script (that block
 * is an input to the Expo fingerprint).
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
const out = mkdtempSync(join(tmpdir(), 'conduct-stage-'));
const src = readFileSync(join(ROOT, 'lib', 'conduct-stage.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'conduct-stage.mjs'), js);
const S = await import(pathToFileURL(join(out, 'conduct-stage.mjs')));

let n = 0;
const check = (name, fn) => {
  fn();
  n += 1;
};

check('amber: a minute on parts of five minutes and more, thirty seconds on short ones', () => {
  assert.equal(S.warnSecFor(10), 60);
  assert.equal(S.warnSecFor(5), 60);
  assert.equal(S.warnSecFor(4), 30, 'the Bible reading');
  assert.equal(S.warnSecFor(3), 30);
  assert.equal(S.stageTone(61, 10), 'calm');
  assert.equal(S.stageTone(60, 10), 'soon');
  assert.equal(S.stageTone(31, 4), 'calm');
  assert.equal(S.stageTone(30, 4), 'soon');
  assert.equal(S.stageTone(0, 4), 'soon', 'zero is still the part, not over');
  assert.equal(S.stageTone(-1, 4), 'over');
});

check('the time to the start, on the meeting day; late is negative', () => {
  const at = new Date(2026, 9, 21, 18, 57, 17).getTime();
  assert.equal(S.untilStartSec('19:00', '2026-10-21', at), 163);
  const late = new Date(2026, 9, 21, 19, 1, 40).getTime();
  assert.equal(S.untilStartSec('19:00', '2026-10-21', late), -100);
  assert.equal(S.untilStartSec(null, '2026-10-21', at), null);
  assert.equal(S.untilStartSec('19:00', null, at), null);
  assert.equal(S.untilStartSec('7 pm', '2026-10-21', at), null);
});

check('«Проверить экран» shows calm, amber and over time for every part, the counsel only after a student part, and ends', () => {
  const segs = [
    { partMin: 6, counselMin: 0 },
    { partMin: 4, counselMin: 1 },
    { partMin: 3, counselMin: 0 },
  ];
  const seen = segs.map(() => new Set());
  let ended = false;
  for (let t = 0; t <= S.demoLengthMs(segs) + 500; t += 100) {
    const f = S.demoFrame(segs, t);
    if (f.phase === 'done') {
      ended = true;
      continue;
    }
    assert.ok(!ended, 'nothing after the end');
    if (f.phase === 'counsel') seen[f.index].add('counsel');
    else {
      assert.ok(f.leftSec <= segs[f.index].partMin * 60, 'never more than the part');
      seen[f.index].add(S.stageTone(f.leftSec, segs[f.index].partMin));
    }
  }
  assert.ok(ended, 'the demo ends');
  for (let i = 0; i < segs.length; i++) {
    for (const tone of ['calm', 'soon', 'over']) assert.ok(seen[i].has(tone), `part ${i}: ${tone}`);
    assert.equal(seen[i].has('counsel'), segs[i].counselMin > 0, `part ${i}: counsel only after a student part`);
  }
  assert.equal(S.demoFrame(segs, 0).leftSec, 360, 'starts at the part’s full time');
  assert.ok(S.demoLengthMs(segs) < 60_000);
});

check('the end against the programme counts a late start; off the meeting day the parts-only figure stands', () => {
  // Programme ends 20:45; begun 4 minutes late, parts on time: ends 20:49.
  const endsAt = new Date(2026, 9, 21, 20, 49, 0).getTime();
  assert.equal(S.endDriftSec(endsAt, '20:45', '2026-10-21', 0), 240);
  const early = new Date(2026, 9, 21, 20, 43, 0).getTime();
  assert.equal(S.endDriftSec(early, '20:45', '2026-10-21', 0), -120);
  // A run on another day (a test, the stand) — no absurd hours.
  const otherDay = new Date(2026, 9, 18, 12, 0, 0).getTime();
  assert.equal(S.endDriftSec(otherDay, '20:45', '2026-10-21', 90), 90);
  assert.equal(S.endDriftSec(endsAt, null, '2026-10-21', 90), 90);
  assert.ok(S.COUNTDOWN_FROM_SEC <= 3600);
});

console.log(`conduct-stage: ${n} groups ok`);
