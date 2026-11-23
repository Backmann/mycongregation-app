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

check('a rehearsal is measured from its own start, as if the meeting were now (R-73)', () => {
  // On the stand, 22 November 2026: a rehearsal at 16:22 said «окончание ≈
  // 18:07 … с опережением» against the real meeting's 20:45 on Wednesday.
  const begun = new Date(2026, 10, 22, 16, 22, 10).getTime();
  const a = S.rehearsalAnchor(begun);
  assert.deepEqual(a, { time: '16:22', day: '2026-11-22' });
  // The programme of 104 min from 16:22 ends 18:06; the run ends there — on time.
  const endsAt = new Date(2026, 10, 22, 18, 6, 0).getTime();
  assert.equal(S.endDriftSec(endsAt, '18:06', a.day, 999), 0);
  // Begun at :40 s of a minute — rounded to the next minute, not cut.
  assert.equal(S.rehearsalAnchor(new Date(2026, 10, 22, 16, 22, 40).getTime()).time, '16:23');
  assert.equal(S.rehearsalAnchor(null), null);
});

check('«Встреча началась в 19:00?» — asked up to three minutes after the start, on its day (R-78)', () => {
  const at = (h, m, sec = 0) => new Date(2026, 10, 25, h, m, sec).getTime();
  const planned = at(19, 0);
  // 18.11: «Начать» at 19:01 — the song had begun before it.
  assert.equal(S.startQuestionAt(at(19, 1, 5), '19:00', '2026-11-25'), planned);
  assert.equal(S.startQuestionAt(at(19, 3, 0), '19:00', '2026-11-25'), planned, 'three minutes still asks');
  assert.equal(S.startQuestionAt(at(19, 3, 1), '19:00', '2026-11-25'), null, 'later: a real late start');
  assert.equal(S.startQuestionAt(at(18, 59, 30), '19:00', '2026-11-25'), null, 'before the start');
  assert.equal(S.startQuestionAt(planned, '19:00', '2026-11-25'), null, 'at it');
  assert.equal(S.startQuestionAt(at(19, 1), '19:00', '2026-11-24'), null, 'another day');
  assert.equal(S.startQuestionAt(at(19, 1), null, '2026-11-25'), null);
  // A meeting moved to 18:30 asks by its own hour.
  assert.equal(S.startQuestionAt(at(18, 31), '18:30', '2026-11-25'), at(18, 30));
});

check('a song step is its recording plus its prayer, not the programme\'s five minutes (R-76, R-77)', () => {
  // 18.11: song 141 (2:23) and its prayer.
  assert.equal(S.songStepSec('midweek_closing_prayer', 143, null), 143 + 90, 'until the congregation has its own: 1:30');
  assert.equal(S.songStepSec('midweek_closing_prayer', 143, { prayer: 75, songLead: null }), 143 + 75);
  assert.equal(S.songStepSec('weekend_opening_prayer', 141, null), 141 + 90);
  // Song 90 (2:56) in the middle: its lead-in, no prayer.
  assert.equal(S.songStepSec('mid_song', 176, { prayer: 75, songLead: 19 }), 176 + 19);
  assert.equal(S.songStepSec('weekend_song', 173, null), 173 + 20);
  // A song with no known length: the median of the recordings.
  assert.equal(S.songStepSec('mid_song', null, null), 151 + 20);
  // Not a song: the programme's minutes stand.
  assert.equal(S.songStepSec('treasures_talk', 143, null), null);
  // The overseer's week: he chooses the closing song, the programme's says nothing.
  assert.equal(S.songIsProgrammes('midweek_closing_prayer', ['co_service_talk', 'midweek_closing_prayer']), false);
  assert.equal(S.songIsProgrammes('weekend_closing_prayer', ['co_concluding_talk', 'weekend_closing_prayer']), false);
  assert.equal(S.songIsProgrammes('weekend_song', ['weekend_song', 'co_concluding_talk']), true);
  assert.equal(S.songIsProgrammes('midweek_closing_prayer', ['cbs_conductor', 'midweek_closing_prayer']), true);
  assert.equal(S.songLength(176), '2:56');
  // The length stands beside the quoted name, never inside its quotes.
  const q = (_k, o) => `«${o.text}»`;
  assert.equal(S.quotedSong(q, 'Name', '2:56'), '«Name» · 2:56');
  assert.equal(S.quotedSong(q, 'Name', null), '«Name»');
  assert.equal(S.songLength(301), '5:01');
});

check("a student part's setting is named by the screens' own words, an unknown one not at all", () => {
  const t = (k) => `[${k}]`;
  assert.equal(S.settingLabel(t, 'house'), '[conduct.setting.house]');
  assert.equal(S.settingLabel(t, 'public'), '[conduct.setting.public]');
  assert.equal(S.settingLabel(t, 'video'), null);
  assert.equal(S.settingLabel(t, null), null);
});

check('time with a correction: the lag goes to the flexible parts by length, none past 15% (R-74)', () => {
  const seg = (key, partMin, extra = {}) => ({ key, partMin, ...extra });
  // A midweek meeting from the talk of the week on.
  const mid = [
    seg('treasures_talk', 10), seg('spiritual_gems', 10), seg('bible_reading', 4),
    seg('apply_yourself_1', 3), seg('mid_song', 3, { soft: true }), seg('living_christians_1', 15),
    seg('cbs_conductor', 30), seg('midweek_closing_words', 3, { chairmanWords: true }), seg('midweek_closing_prayer', 5, { soft: true }),
  ];
  // THE CASE: 1:47 behind before the talk of the week — 68 minutes of flexible
  // parts share it by length; hard parts and songs give nothing.
  const p = S.flexPlan(mid, 0, null, 107);
  assert.equal(p.cut.has(2) || p.cut.has(3) || p.cut.has(4) || p.cut.has(8), false, 'reading, student part and songs stay');
  assert.equal(p.cut.get(6), 40, 'the study, 30 of 68 minutes: 47 s, to 40');
  assert.equal(p.cut.get(0), 10);
  assert.ok(p.uncoveredSec <= 10 * p.cut.size, 'rounding only');
  // Seconds are not worth it: under a minute behind, nothing is touched.
  assert.equal(S.flexPlan(mid, 0, null, 59).cut.size, 0);
  assert.equal(S.flexPlan(mid, 0, null, 60).cut.size > 0, true);
  // No lag, or ahead: nothing is cut and nothing is added.
  assert.equal(S.flexPlan(mid, 0, null, 0).cut.size, 0);
  assert.equal(S.flexPlan(mid, 0, null, -300).cut.size, 0);
  // A big lag: each flexible part gives 15% at most; the rest is said.
  const big = S.flexPlan(mid, 0, null, 1800);
  assert.equal(big.cut.get(6), 270, 'the study: 4:30 of 30 minutes');
  assert.equal(big.cut.get(7), 20, 'the closing words: 27 s rounded down to 20');
  assert.ok(big.uncoveredSec > 1800 - 0.15 * 68 * 60 - 1);
  // The part under way gives no more than it has left.
  const now = S.flexPlan(mid, 5, 20, 600);
  assert.equal(now.cut.get(5), 20);
  assert.equal(now.cut.has(0), false, 'parts behind are not touched');
  // A capped part's share goes to the others.
  // The talk under way has 10 s left: it gives 10, its share's rest goes to the study.
  const two = S.flexPlan([seg('treasures_talk', 10), seg('cbs_conductor', 30)], 0, 10, 120);
  assert.equal(two.cut.get(0), 10);
  assert.equal(two.cut.get(1), 110);
  // Overseer's talks and the public talk are hard.
  assert.equal(S.isFlexible({ key: 'co_service_talk' }), false);
  assert.equal(S.isFlexible({ key: 'public_talk_speaker' }), false);
  assert.equal(S.isFlexible({ key: 'watchtower_conductor' }), true);
  assert.equal(S.minutesAfterCut(30, 60), '29');
  assert.equal(S.minutesAfterCut(15, 30), '14:30');
});

check('the part under way keeps one cut: the lag as it stood when it began (R-74, review of 23 November 2026)', () => {
  const seg = (key, partMin, extra = {}) => ({ key, partMin, ...extra });
  const mid = [seg('treasures_talk', 10), seg('bible_reading', 4), seg('cbs_conductor', 30)];
  // Its own seconds: overtime, and pauses inside it (wall time since it began less its clock).
  const T = 1_000_000;
  assert.equal(S.ownSecOf(10, 300, T, T + 300_000), 0, 'running, no pause');
  assert.equal(S.ownSecOf(10, 300, T, T + 420_000), 120, 'paused two minutes, five minutes in');
  assert.equal(S.ownSecOf(10, 660, T, T + 660_000), 60, 'a minute over');
  assert.equal(S.ownSecOf(10, 660, T, T + 720_000), 120, 'a minute over and a minute of pause');
  assert.equal(S.ownSecOf(10, 660, null, T), 60, 'no start kept: overtime only');
  // Second by second through a talk: begun 59.6 s behind the end, a pause of 47.3 s at 4:00,
  // then 1:30.7 over its ten minutes. The lag at its start must not move by a second,
  // and the cut must never blink (59.6 rounds to 60: one 10 s step on the edge).
  {
    const day = '2026-11-25';
    const start = new Date(2026, 10, 25, 19, 0, 0).getTime();
    const rest = 30 * 60 + 4 * 60; // the study and the reading after the talk
    const plannedEnd = '19:44';
    const began = start + 59_600; // begun 59.6 s late: the end runs as late
    const seen = new Set();
    const cuts = new Set();
    for (let t = 0; t <= 790; t += 0.37) {
      const now = began + t * 1000;
      const pause = t < 240 ? 0 : t < 287.3 ? t - 240 : 47.3;
      const elapsed = t - pause;
      const remaining = Math.max(0, 600 - elapsed) + rest;
      const own = S.ownSecOf(10, elapsed, began, now);
      const lag0 = S.startLagSec(now, remaining, own, plannedEnd, day, 0);
      seen.add(lag0);
      const lagNow = S.endDriftSec(now + remaining * 1000, plannedEnd, day, 0);
      cuts.add(S.correctionOf([{ key: 'treasures_talk', partMin: 10 }, { key: 'cbs_conductor', partMin: 30 }], 0, true, elapsed, lagNow, lag0).curCut);
    }
    assert.deepEqual([...seen], [60], 'the lag at its start, through the pause and the overtime');
    assert.equal(cuts.size, 1, `one cut for the whole talk, saw ${[...cuts]}`);
  }
  // The lag at its start stands; the lag now goes to the parts after it.
  const at0 = S.correctionOf(mid, 0, true, 0, 120, 120);
  assert.equal(at0.curCut, 30);
  const over = S.correctionOf(mid, 0, true, 660, 180, 120);
  assert.equal(over.curCut, 30, 'overtime does not move the cut under way (from 3:00 it would be 0:40)');
  assert.equal(over.curCutLeft, 0, 'its clock has run out');
  assert.equal(over.rest.cut.get(2), at0.rest.cut.get(2) + 60, 'the study takes the minute');
  // Not ready (song lengths or averages not in) or not running: no correction at all.
  const none = S.correctionOf(mid, 0, true, 0, null, null);
  assert.equal(none.hasCuts, false);
  assert.equal(none.lagSec, 0);
  // A hard part under way gives nothing; the parts after it take the lag.
  const hard = S.correctionOf(mid, 1, false, 0, 120, 120);
  assert.equal(hard.curCut, 0);
  assert.ok(hard.rest.cut.get(2) > 0);
  // Nothing flexible left: no cuts, no line, the plain drift.
  const tail = S.correctionOf([seg('bible_reading', 4)], 0, false, 0, 300, 300);
  assert.equal(tail.hasCuts, false);
  assert.equal(S.stageCatchingUp(tail, 300), false);
  assert.equal(S.stageCatchingUp(tail, 0), false, 'no cuts, no «нагоняем», whatever the end says');
  // «нагоняем» only while the cuts cover the lag.
  assert.equal(S.stageCatchingUp(at0, 0), true);
  assert.equal(S.stageCatchingUp(at0, 59), true);
  assert.equal(S.stageCatchingUp(at0, 60), false, 'a minute late even with the cuts: the plain drift');
  assert.equal(S.stageCatchingUp(S.correctionOf(mid, 0, true, 0, 59, 59), 0), false, 'under a minute: nothing to say');
});

console.log(`conduct-stage: ${n} groups ok`);
