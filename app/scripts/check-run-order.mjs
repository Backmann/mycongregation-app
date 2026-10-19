#!/usr/bin/env node
/**
 * The midweek minutes, pinned.
 *
 * `lib/run-order.ts` is the only place that says how long each segment of the
 * midweek meeting runs. The schedule sheet takes its clock from it and conduct
 * mode takes its countdown. While that walk lived inside a function, anyone
 * could shift it by a minute and nothing would notice: the times on the sheet
 * would simply become different ones, with nothing to compare them against.
 *
 * The app has no test runner and adding one mid-flight is its own project, so
 * this is a script — called directly from the gate, like the week rules, the
 * date guard and the i18n checks, and never through a new npm script (that
 * block is an input to the Expo fingerprint).
 *
 * The cases below are the weeks that actually occur: an ordinary one, one with
 * a fourth ministry part, one where two Living-as-Christians parts carry no
 * duration, and the week of the circuit overseer's visit, where the
 * congregation Bible study is withdrawn.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

// The module imports nothing — no types, no neighbours — so it travels alone.
// That is deliberate: the truth about the minutes should have no dependencies.
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'run-order-'));
const src = readFileSync(join(ROOT, 'lib', 'run-order.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
writeFileSync(join(out, 'run-order.mjs'), js);
const { buildMidweekRunOrder, buildWeekendRunOrder, totalRunMinutes } = await import(
  pathToFileURL(join(out, 'run-order.mjs'))
);

let n = 0;
const p = (partKey, partDurationMin = null, partTitle = null) => ({
  id: `a${++n}`,
  partKey,
  partDurationMin,
  partTitle,
});

/** A week as the workbook parser leaves it. */
const week = (extra = [], drop = []) =>
  [
    p('midweek_chairman'),
    p('midweek_opening_prayer'),
    p('treasures_talk', 10),
    p('spiritual_gems', 10),
    p('bible_reading', 4),
    p('apply_yourself_1', 3),
    p('apply_yourself_2', 4),
    p('apply_yourself_3', 5),
    p('mid_song'),
    p('living_christians_1', 15),
    p('cbs_conductor', 30),
    p('cbs_reader'),
    p('midweek_closing_prayer'),
  ]
    .filter((i) => !drop.includes(i.partKey))
    .concat(extra);

const CASES = [
  {
    name: 'обычная неделя',
    items: week(),
    // key · minutes
    expect: [
      ['midweek_opening_prayer', 6],
      ['treasures_talk', 10],
      ['spiritual_gems', 10],
      ['bible_reading', 5],
      ['apply_yourself_1', 4],
      ['apply_yourself_2', 5],
      ['apply_yourself_3', 6],
      ['mid_song', 5],
      ['living_christians_1', 15],
      ['cbs_conductor', 30],
      ['midweek_closing_prayer', 9],
    ],
    total: 105,
  },
  {
    name: 'четвёртое задание',
    items: week([p('apply_yourself_4', 4)]),
    expect: [
      ['midweek_opening_prayer', 6],
      ['treasures_talk', 10],
      ['spiritual_gems', 10],
      ['bible_reading', 5],
      ['apply_yourself_1', 4],
      ['apply_yourself_2', 5],
      ['apply_yourself_3', 6],
      ['apply_yourself_4', 5],
      ['mid_song', 5],
      ['living_christians_1', 15],
      ['cbs_conductor', 30],
      ['midweek_closing_prayer', 9],
    ],
    total: 110,
  },
  {
    name: 'две части «Христианской жизни» без длительностей',
    items: week([p('living_christians_2')], ['living_christians_1']).concat(
      p('living_christians_1'),
    ),
    // the fifteen minutes are split evenly
    expectMinutesOf: { living_christians_1: 8, living_christians_2: 8 },
  },
  {
    name: 'визит районного: изучение снято, речь надзирателя на его месте',
    items: week([p('co_service_talk', 30)], ['cbs_conductor', 'cbs_reader']),
    expect: [
      ['midweek_opening_prayer', 6],
      ['treasures_talk', 10],
      ['spiritual_gems', 10],
      ['bible_reading', 5],
      ['apply_yourself_1', 4],
      ['apply_yourself_2', 5],
      ['apply_yourself_3', 6],
      ['mid_song', 5],
      ['living_christians_1', 15],
      ['co_service_talk', 30],
      ['midweek_closing_prayer', 9],
    ],
    total: 105,
  },
  {
    // 14 October 2026: an elder's discussion in the ministry section has no
    // student and no counsel after it — its minutes are the programme's.
    name: 'обсуждение в «Оттачиваем навыки» — без минуты на совет',
    items: week(
      [p('apply_yourself_3', 15, 'Объясняйте свои взгляды: Обсуждение. Посмотрите видео')],
      ['apply_yourself_3'],
    ),
    expectMinutesOf: { apply_yourself_1: 4, apply_yourself_2: 5, apply_yourself_3: 15 },
    expectSplit: {
      bible_reading: [4, 1],
      apply_yourself_1: [3, 1],
      apply_yourself_3: [15, 0],
      treasures_talk: [10, 0],
    },
  },
  {
    // A student's part is not taken for a discussion because the heading
    // talks about one or a note mentions it later on.
    name: 'ученическое задание со словом «обсуждение» внутри — минута остаётся',
    items: week(
      [p('apply_yourself_3', 5, 'Объясняйте свои взгляды: Речь. Обсуждение с хозяином')],
      ['apply_yourself_3'],
    ),
    expectSplit: { apply_yourself_3: [5, 1] },
  },
];

const fails = [];

for (const c of CASES) {
  const segs = buildMidweekRunOrder(c.items);

  if (c.expect) {
    const got = segs.map((s) => [s.key, s.minutes]);
    const same =
      got.length === c.expect.length &&
      got.every((g, i) => g[0] === c.expect[i][0] && g[1] === c.expect[i][1]);
    if (!same) {
      fails.push(
        `${c.name}:\n  ждали: ${JSON.stringify(c.expect)}\n  вышло: ${JSON.stringify(got)}`,
      );
    }
  }

  if (c.expectMinutesOf) {
    for (const [key, minutes] of Object.entries(c.expectMinutesOf)) {
      const seg = segs.find((s) => s.key === key);
      if (!seg) fails.push(`${c.name}: отрезка «${key}» нет вовсе`);
      else if (seg.minutes !== minutes) {
        fails.push(`${c.name}: «${key}» ${seg.minutes} мин вместо ${minutes}`);
      }
    }
  }

  // The student counts down from the programme's own figure; the counsel
  // minute is kept apart and the clock still holds both (Lionel, 14.10.2026).
  if (c.expectSplit) {
    for (const [key, [partMin, counselMin]] of Object.entries(c.expectSplit)) {
      const seg = segs.find((s) => s.key === key);
      if (!seg) fails.push(`${c.name}: отрезка «${key}» нет вовсе`);
      else if (seg.partMin !== partMin || seg.counselMin !== counselMin) {
        fails.push(
          `${c.name}: «${key}» задание ${seg.partMin} + совет ${seg.counselMin} вместо ${partMin} + ${counselMin}`,
        );
      }
    }
  }
  for (const s of segs) {
    if (s.minutes !== s.partMin + s.counselMin) {
      fails.push(`${c.name}: у «${s.key}» на часах ${s.minutes}, а задание и совет дают ${s.partMin + s.counselMin}`);
    }
  }

  if (c.total !== undefined) {
    const total = totalRunMinutes(segs);
    if (total !== c.total) {
      fails.push(`${c.name}: встреча ${total} мин вместо ${c.total}`);
    }
  }

  // Neither of these may ever have a segment: the chairman and the CBS
  // reader are roles within the meeting, not items in it.
  for (const key of ['midweek_chairman', 'cbs_reader']) {
    if (segs.some((s) => s.key === key)) {
      fails.push(`${c.name}: у «${key}» появился свой отрезок, а его быть не должно`);
    }
  }

  // The song runs on the clock but shows no range on the sheet.
  const song = segs.find((s) => s.key === 'mid_song');
  if (song && song.showInterval) {
    fails.push(`${c.name}: у средней песни появились часы на листе`);
  }
}

// THE WEEKEND MEETING (18 October 2026). An ordinary week: 5 + 30 + 5 + 60 + 5;
// the circuit overseer's week (Lionel): talk 30, study 30, his talk 30.
{
  const row = (partKey, id = partKey, partDurationMin = null) => ({ id, partKey, partDurationMin, partTitle: null });
  const plain = buildWeekendRunOrder([
    row('weekend_chairman'),
    row('weekend_opening_prayer'),
    row('public_talk_speaker'),
    row('watchtower_conductor'),
    row('watchtower_reader'),
    row('weekend_closing_prayer'),
  ]);
  const minutes = (segs) => segs.map((x) => `${x.key}:${x.minutes}`).join(' ');
  const want = 'weekend_opening_prayer:5 public_talk_speaker:30 weekend_song:5 watchtower_conductor:60 weekend_closing_prayer:5';
  if (minutes(plain) !== want) fails.push(`weekend: ${minutes(plain)}\n    want ${want}`);
  if (totalRunMinutes(plain) !== 105) fails.push(`weekend total ${totalRunMinutes(plain)}, want 105`);
  if (plain.find((x) => x.key === 'weekend_song').showInterval !== false) fails.push('weekend song carries no range');
  if (plain.some((x) => x.counselMin !== 0)) fails.push('no counsel on the weekend');
  const co = buildWeekendRunOrder([
    row('weekend_opening_prayer'),
    row('public_talk_speaker'),
    row('watchtower_conductor', 'wt', 60), // an import that still says 60
    row('co_concluding_talk'),
    row('weekend_closing_prayer'),
  ]);
  const wantCo =
    'weekend_opening_prayer:5 public_talk_speaker:30 weekend_song:5 watchtower_conductor:30 co_concluding_talk:30 weekend_closing_prayer:5';
  if (minutes(co) !== wantCo) fails.push(`CO week: ${minutes(co)}\n    want ${wantCo}`);
  // A visit week with two songs (19 October 2026): the earlier is the one
  // before the study; the later, the closing song after the overseer's talk,
  // is no segment of its own — it is inside the closing five minutes.
  const twoSongs = buildWeekendRunOrder([
    { ...row('weekend_song', 'closing-song'), partOrder: 7 },
    row('weekend_opening_prayer'),
    row('public_talk_speaker'),
    { ...row('weekend_song', 'study-song'), partOrder: 3 },
    row('watchtower_conductor'),
    row('co_concluding_talk'),
    row('weekend_closing_prayer'),
  ]);
  if (twoSongs.find((x) => x.key === 'weekend_song')?.assignmentId !== 'study-song')
    fails.push('two weekend songs: the one before the study must be the earlier by the programme');
  if (minutes(twoSongs) !== wantCo) fails.push(`CO week, two songs: ${minutes(twoSongs)}`);
}

if (fails.length > 0) {
  console.error('Минуты будней встречи разошлись с закреплёнными:\n');
  for (const f of fails) console.error('  ' + f + '\n');
  console.error(
    'Если сдвиг намеренный — поправь ожидания в этом скрипте ТЕМ ЖЕ коммитом,\n' +
      'чтобы причина осталась видна рядом с правкой.',
  );
  process.exit(1);
}

console.log(`OK: run order pinned (${CASES.length} cases, midweek; weekend and the CO week).`);
