#!/usr/bin/env node
/**
 * «Файлы программы» (lib/programme-files.ts, 20 November 2026), held to
 * examples: what each meeting of a week shows («из файла» / «есть» / «нет» /
 * «встречи нет» — never «вручную» for a week loaded before the import began
 * to remember its titles), the «Люди» column, which meeting a file is for,
 * and what each picked file would add before anything is loaded.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'programme-files-'));
writeFileSync(
  join(out, 'programme-files.mjs'),
  ts.transpileModule(readFileSync(join(ROOT, 'lib', 'programme-files.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText,
);
const P = await import(pathToFileURL(join(out, 'programme-files.mjs')));

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

const side = (o = {}) => ({
  held: true, programme: (o.parts ?? 0) > 0 && o.programme !== false, parts: 0, fromFile: false, byHand: 0, assigned: 0, total: 0, ...o,
});
const week = (weekStart, midweek = {}, weekend = {}) => ({
  weekStart, coVisit: false, midweek: side(midweek), weekend: side(weekend),
});

// --- what a meeting shows
check('imported', P.sideStatus(side({ parts: 9, fromFile: true })), 'fromFile');
check('old or by hand is only «есть»', P.sideStatus(side({ parts: 9 })), 'present');
check('held and empty', P.sideStatus(side()), 'missing');
check('not held', P.sideStatus(side({ held: false })), 'notHeld');
check('a part added by hand is not the programme',
  P.sideStatus(side({ parts: 1, programme: false })), 'partial');
check('no meeting stays «no meeting» even with parts left',
  P.sideStatus(side({ held: false, parts: 3, fromFile: true })), 'notHeld');
check('parts left in a week without the meeting are said', P.leftover(side({ held: false, parts: 3 })), 3);
check('nothing left over in a held week', P.leftover(side({ parts: 3 })), 0);

// --- people
const T = '2026-11-23';
check('past week', P.peopleOf(week('2026-11-16', { total: 9, assigned: 9 }), T), { kind: 'past' });
check('nothing to name', P.peopleOf(week(T), T), { kind: 'none' });
check('both meetings counted',
  P.peopleOf(week(T, { total: 12, assigned: 10 }, { total: 5, assigned: 2 }), T),
  { kind: 'some', assigned: 12, total: 17 });
check('all named', P.peopleOf(week(T, { total: 12, assigned: 12 }, { total: 5, assigned: 5 }), T), { kind: 'all' });
check('a meeting not held does not count',
  P.peopleOf(week(T, { total: 12, assigned: 12 }, { held: false, total: 5 }), T), { kind: 'all' });

// --- which meeting a file is for
check('workbook by parts', P.fileMeeting('x.epub', ['treasures_talk', 'unknown']), 'midweek');
check('Watchtower by parts', P.fileMeeting('mwb_wrong.epub', ['public_talk_speaker', 'watchtower_conductor']), 'weekend');
check('by name when no parts', P.fileMeeting('w_R_202701.epub', []), 'weekend');
check('by name, workbook', P.fileMeeting('MWB_R_202701.epub', ['unknown']), 'midweek');
check('unknown', P.fileMeeting('book.epub', []), null);

// --- planning picked files
const known = [
  week('2026-12-21', { parts: 9, fromFile: true }, { parts: 8, fromFile: true }),
  week('2026-12-28'),
  week('2027-01-04', {}, { held: false }),
  week('2027-01-11'),
];
const mwbNew = { name: 'mwb_R_202701.epub', weekStarts: ['2026-12-28', '2027-01-11'], partKeys: ['treasures_talk'] };
const mwbOld = { name: 'mwb_R_202611.epub', weekStarts: ['2026-12-21'], partKeys: ['treasures_talk'] };
const mwbMixed = { name: 'mwb_x.epub', weekStarts: ['2026-12-21', '2026-12-28'], partKeys: ['treasures_talk'] };
const wt = { name: 'w_R_202610.epub', weekStarts: ['2027-01-04', '2027-01-11'], partKeys: ['watchtower_conductor'] };
const wtAllAway = { name: 'w_y.epub', weekStarts: ['2027-01-04'], partKeys: ['watchtower_conductor'] };

const plans = P.planFiles([mwbNew, mwbOld, mwbNew, wt, wtAllAway, mwbMixed], known);
check('verdicts', plans.map((p) => p.verdict), ['new', 'repeat', 'sameAsOther', 'new', 'nothing', 'sameAsOther']);
check('new weeks of the workbook', plans[0].newWeeks, ['2026-12-28', '2027-01-11']);
check('a week without the meeting is not «new»', plans[3].notHeldWeeks, ['2027-01-04']);
check('the same file twice: only the first loads', P.filesToLoad(plans), [0, 3]);
const alone = P.planFiles([mwbMixed], known)[0];
check('partly new', [alone.verdict, alone.newWeeks, alone.loadedWeeks], ['partly', ['2026-12-28'], ['2026-12-21']]);
check('a week the summary lacks counts as new',
  P.planFiles([{ name: 'mwb_z.epub', weekStarts: ['2030-01-07'], partKeys: ['treasures_talk'] }], known)[0].verdict, 'new');
check('a week with single parts only is new for the file',
  P.planFiles([{ name: 'mwb_z.epub', weekStarts: ['2026-12-28'], partKeys: ['treasures_talk'] }],
    [week('2026-12-28', { parts: 1, programme: false })])[0].verdict, 'new');
check('the meeting decides, not the week: the weekend of a loaded week is new',
  P.planFiles([{ name: 'w_z.epub', weekStarts: ['2026-12-28'], partKeys: ['watchtower_conductor'] }],
    [week('2026-12-28', { parts: 9, fromFile: true })])[0].verdict, 'new');

// --- what to load next
check('nothing missing', P.nextStep('2026-12-21', null), { kind: 'done' });
check('a missing week before the last loaded is a gap',
  P.nextStep('2026-12-21', '2026-11-16'), { kind: 'gap', week: '2026-11-16' });
check('missing after the last loaded', P.nextStep('2026-12-21', '2026-12-28'), { kind: 'from', week: '2026-12-28' });
check('nothing loaded at all', P.nextStep(null, '2026-11-16'), { kind: 'from', week: '2026-11-16' });

// --- the window asked for
check('window', P.windowOf(['2027-01-11', '2026-12-28']), { from: '2026-12-28', count: 3 });
check('window capped', P.windowOf(['2026-01-05', '2027-12-27']).count, 30);
check('no weeks, no window', P.windowOf([]), null);

const screen = readFileSync(join(ROOT, 'app/(app)/schedule/import.tsx'), 'utf8');
check('the screen plans files before loading', screen.includes('planFiles('), true);
check('the screen asks the weeks summary', screen.includes('scheduleImportApi.weeks('), true);
console.log(`${failures ? '✗' : '✓'} файлы программы: ${passed} проверок${failures ? `, ошибок ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
