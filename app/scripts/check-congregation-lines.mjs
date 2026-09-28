#!/usr/bin/env node
/**
 * The lines under the «Собрание» doors, checked (27 September).
 *
 * `lib/congregation-lines.ts` decides what each door says and which lines are
 * amber. The decisions it carries are old ones and easy to break by accident:
 * the duties are only counted, never amber; a missing cleaning after the
 * meetings is amber only to whoever plans the cleaning, and never in a week
 * without meetings; the absences line follows whose list the door opens.
 *
 * Called directly from the gate — no test runner in the app, and a new npm
 * script would move the Expo fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'congregation-lines-'));
const src = readFileSync(join(ROOT, 'lib', 'congregation-lines.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'congregation-lines.mjs'), js);
const { congregationLines } = await import(pathToFileURL(join(out, 'congregation-lines.mjs')));

// A «translation» that shows which key was used, so the cases read the rule.
const t = (key) => key.replace('congregationHub.live.', '');
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    получено: ${g}\n    ожидалось: ${w}`);
  }
}

const base = {
  today: '2026-09-27',
  duties: { next: { date: '2026-09-27', kind: 'weekend', assigned: 0, total: 8 } },
  talks: { nextIncoming: null },
  absences: { readAll: false, awayNow: null, mine: null },
  cleaning: { thisWeek: { afterMeeting: null, thorough: null, meetingsHeld: true }, mine: null },
  meetingPlace: null,
  myGroup: null,
  groups: { count: 2 },
};
const perms = { manageAbsences: false, editCleaning: false };
const lines = (over, p = {}) => congregationLines({ ...base, ...over }, { ...perms, ...p }, t, 'ru');
const due = (l) => (l ? l.due : null);

// Programme — judged.
check('программа: не готово — янтарь', due(lines({ programme: { windowWeeks: 4, notReady: 2, loadedUntil: '2026-11-08' } }).programme), true);
check('программа: всё собрано — без цвета', due(lines({ programme: { windowWeeks: 4, notReady: 0, loadedUntil: '2026-11-08' } }).programme), false);
check('программа: не импортирована — янтарь', due(lines({ programme: { windowWeeks: 4, notReady: 0, loadedUntil: null } }).programme), true);
check('программа: не для него — строки нет', lines({}).programme, undefined);

// Duties — counted, never amber, even at 0 of 8.
check('обязанности 0 из 8 — без цвета', due(lines({}).duties), false);
check('обязанности: встреч впереди нет — строки нет', lines({ duties: { next: null } }).duties, undefined);

// Tasks.
check('задачи: просрочена — янтарь', due(lines({ tasks: { open: 3, overdue: 1 } }).tasks), true);
check('задачи: без просроченных — без цвета', due(lines({ tasks: { open: 3, overdue: 0 } }).tasks), false);
check('задачи: не для него — строки нет', lines({}).tasks, undefined);

// Cleaning.
check('уборка: планирующему, пусто после встреч — янтарь', lines({}, { editCleaning: true }).cleaning, { text: 'cleaningMissing', due: true });
check('уборка: неделя без встреч — не дыра',
  lines({ cleaning: { thisWeek: { afterMeeting: null, thorough: null, meetingsHeld: false }, mine: null } }, { editCleaning: true }).cleaning,
  { text: 'cleaningNoMeetings', due: false });
check('уборка: пустая еженедельная — не дыра',
  due(lines({ cleaning: { thisWeek: { afterMeeting: 'Hamm', thorough: null, meetingsHeld: true }, mine: null } }, { editCleaning: true }).cleaning), false);
check('уборка: возвещателю без своей очереди — строки нет', lines({}).cleaning, undefined);
check('уборка: возвещателю — своя очередь, без цвета',
  due(lines({ cleaning: { thisWeek: { afterMeeting: null, thorough: null, meetingsHeld: true }, mine: { weekStart: '2026-10-12', slot: 'after_meeting', plannedAt: null } } }).cleaning), false);

// Absences follow whose list the door opens.
check('отсутствия: ведущему список — сколько сейчас',
  lines({ absences: { readAll: true, awayNow: 3, mine: null } }, { manageAbsences: true }).absences?.text, 'awayNow');
check('отсутствия: остальным — свой отъезд',
  lines({ absences: { readAll: true, awayNow: 3, mine: { startDate: '2026-10-10', endDate: null } } }).absences?.text, 'awayMineNext');
// The door says «Отсутствия» (everyone's): his own trip is not what it opens.
check('отсутствия: ведущему без общего счёта — не свой отъезд',
  lines({ absences: { readAll: false, awayNow: null, mine: { startDate: '2026-10-10', endDate: null } } }, { manageAbsences: true }).absences, undefined);
check('отсутствия: своего нет — строки нет', lines({ absences: { readAll: true, awayNow: 3, mine: null } }).absences, undefined);

// Roster and groups.
check('возвещатели: не для него — строки нет', lines({}).publishers, undefined);
check('группы: со своей', lines({ myGroup: { name: 'Ahlen', overseerName: null } }).groups.text, 'groupsMine');

if (failures) {
  console.error(`\nСтроки «Собрания»: ${failures} из ${passed + failures} не сходятся.`);
  process.exit(1);
}
console.log(`OK: строки «Собрания» как решено (${passed} случаев).`);
