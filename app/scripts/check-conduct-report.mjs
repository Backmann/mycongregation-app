#!/usr/bin/env node
/**
 * The detailed result of a midweek meeting (lib/conduct-report.ts), pinned.
 * The property it exists for: with every part's start known, the curve ends
 * exactly on the meeting's total over the programme, and the pauses it places
 * add up to the time in no part. Called directly from the gate, never through
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
const out = mkdtempSync(join(tmpdir(), 'conduct-report-'));
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib', 'conduct-report.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'conduct-report.mjs'), js);
const { buildReport, rowsByDeviation } = await import(pathToFileURL(join(out, 'conduct-report.mjs')));

const SECTION = {
  midweek_opening_prayer: 'opening', treasures_talk: 'treasures', bible_reading: 'treasures',
  apply_yourself_1: 'apply_yourself', mid_song: 'christian_life', cbs_conductor: 'christian_life',
  midweek_closing_prayer: 'closing',
};
const COUNSEL = { bible_reading: 60, apply_yourself_1: 60 };
const opts = {
  sectionOf: (k) => SECTION[k] ?? 'opening',
  counselPlannedOf: (k) => (k in SECTION ? (COUNSEL[k] ?? 0) : null),
};

// A small meeting: plan 5+10+4(+1)+3(+1)+5+30+5 = 64 min = 3840 s.
// Parts as they went, with the pauses between them placed by their starts.
const seg = (key, plannedSec, actualSec, counselSec, startSec) => ({ key, plannedSec, actualSec, counselSec, startSec });
const timed = [
  seg('midweek_opening_prayer', 300, 320, null, 0),
  seg('treasures_talk', 600, 640, null, 340), // 20 s pause before
  seg('bible_reading', 240, 252, 73, 985), // 5 s before
  seg('apply_yourself_1', 180, 205, 70, 1340), // 30 s before (bible reading + counsel ended at 1310)
  seg('mid_song', 300, 270, null, 1615),
  seg('cbs_conductor', 1800, 1690, null, 1890), // 5 s
  seg('midweek_closing_prayer', 300, 290, null, 3580),
];
const TOTAL = 3880; // the last part ended at 3870: a 10 s closing moment
const PLAN = 3840;

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

check('timed: the curve ends exactly on the meeting over its programme', () => {
  const r = buildReport({ segments: timed, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  assert.equal(r.timed, true);
  assert.equal(r.overSec, 40);
  const last = r.points[r.points.length - 1];
  assert.equal(last.x, TOTAL);
  assert.equal(last.y, r.overSec);
});

check('timed: the pauses it places add up to the time in no part', () => {
  const r = buildReport({ segments: timed, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  const pauses = r.rows.reduce((a, x) => a + x.pauseAfterSec, 0);
  assert.equal(pauses, r.betweenSec);
  assert.deepEqual(r.rows.map((x) => x.pauseAfterSec), [20, 5, 30, 0, 5, 0, 10]);
  assert.equal(r.betweenSec, 70);
  // A pause shows on the curve as its own stretch.
  assert.ok(r.points.some((p) => p.pause && p.index === 0), 'the 20 s after the opening');
});

check('the peak is the furthest behind, and names the part it follows', () => {
  const r = buildReport({ segments: timed, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  const maxY = Math.max(...r.points.map((p) => p.y));
  assert.equal(r.peak.y, maxY);
  assert.equal(r.rows[r.peak.index].key, 'apply_yourself_1');
});

check('an older result (no starts): no pauses placed, the curve without them, said so', () => {
  const old = timed.map(({ startSec, ...s }) => s);
  const r = buildReport({ segments: old, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  assert.equal(r.timed, false);
  assert.ok(r.rows.every((x) => x.pauseAfterSec === null));
  assert.equal(r.betweenSec, 70);
  const last = r.points[r.points.length - 1];
  assert.equal(last.y, r.overSec - r.betweenSec, 'without the pauses the end differs by exactly them');
});

check('one part without a start is enough to stop placing pauses', () => {
  const mixed = timed.map((s, i) => (i === 3 ? { ...s, startSec: null } : s));
  assert.equal(buildReport({ segments: mixed, totalSec: TOTAL, plannedSec: PLAN, ...opts }).timed, false);
});

check('sections: part and counsel, against the programme with its counsel minutes', () => {
  const r = buildReport({ segments: timed, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  assert.deepEqual(r.sections, [
    { section: 'treasures', plannedSec: 600 + 240 + 60, actualSec: 640 + 252 + 73 },
    { section: 'apply_yourself', plannedSec: 180 + 60, actualSec: 205 + 70 },
    { section: 'christian_life', plannedSec: 2100, actualSec: 1960 },
  ]);
});

check('counsel: how many, on average, against its minute; a skipped one still has its minute in the plan', () => {
  const r = buildReport({ segments: timed, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  assert.equal(r.counsel.count, 2);
  assert.equal(r.counsel.averageSec, 71.5);
  const skipped = timed.map((s) => (s.key === 'apply_yourself_1' ? { ...s, counselSec: null } : s));
  const r2 = buildReport({ segments: skipped, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  const row = r2.rows.find((x) => x.key === 'apply_yourself_1');
  assert.equal(row.counselPlannedSec, 60);
  assert.equal(row.counselDevSec, null);
});

check('a part the programme no longer has: counsel minute guessed from whether one was given', () => {
  const r = buildReport({
    segments: [seg('gone_part', 240, 250, 65, 0)], totalSec: 315, plannedSec: 300, ...opts,
  });
  assert.equal(r.rows[0].counselPlannedSec, 60);
  assert.equal(r.rows[0].section, 'opening');
});

check('by deviation: the furthest first, part and counsel together; ties keep the programme order', () => {
  const r = buildReport({ segments: timed, totalSec: TOTAL, plannedSec: PLAN, ...opts });
  const keys = rowsByDeviation(r.rows).map((x) => x.key);
  assert.deepEqual(keys, [
    // 110, 40, 35, 30, 25 (12 + its counsel's 13), 20, 10
    'cbs_conductor', 'treasures_talk', 'apply_yourself_1', 'mid_song',
    'bible_reading', 'midweek_opening_prayer', 'midweek_closing_prayer',
  ]);
});

check('never behind the programme: no peak', () => {
  const r = buildReport({
    segments: [seg('treasures_talk', 600, 580, null, 0)], totalSec: 580, plannedSec: 600, ...opts,
  });
  assert.equal(r.peak, null);
});

if (process.exitCode) process.exit(1);
console.log(`✓ Подробный итог встречи: ${n} проверок`);
