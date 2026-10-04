#!/usr/bin/env node
/**
 * The lines under the «Служение» doors, checked (4 October 2026).
 *
 * `lib/service-lines.ts` decides what each door says and which lines are
 * amber. The decisions are easy to break by accident: one's own report is
 * amber, the collection never; unrecorded attendance is amber only to those
 * who record it; unvisited groups only to those who plan the visits and only
 * from May; whose a field-service meeting is comes from lib/field-audience.
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
const out = mkdtempSync(join(tmpdir(), 'service-lines-'));
for (const name of ['field-audience', 'service-lines']) {
  const src = readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8');
  const js = ts
    .transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replace("'./field-audience'", "'./field-audience.mjs'");
  writeFileSync(join(out, `${name}.mjs`), js);
}
const { serviceLines } = await import(pathToFileURL(join(out, 'service-lines.mjs')));

// A «translation» that shows which key was used and with what.
const t = (key, o) =>
  key.replace('serviceHub.live.', '').replace('congregationHub.live.', '') +
  (o ? ' ' + JSON.stringify(o) : '');
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

const TODAY = '2026-10-07'; // a Wednesday
const base = { today: TODAY, nowHM: '12:00', me: 'p-me', myGroupId: 'g-hamm' };
const perms = { recordsAttendance: false, plansVisits: false };
const lines = (over, p = {}) => serviceLines({ ...base, ...over }, { ...perms, ...p }, t, 'ru');
const key = (l) => (l ? l.text.split(' ')[0] : null);
const due = (l) => (l ? l.due : null);

// Nothing loaded — nothing said: every row keeps its description.
check('ничего не загружено — строк нет', lines({}), {});

// The reader's own report.
const standing = (o) => ({ applicable: true, reportMonth: '2026-09-01', submitted: false, reportId: null, closesOn: null, daysLeft: null, ...o });
check('отчёт не сдан — янтарь', [key(lines({ standing: standing() }).reports), due(lines({ standing: standing() }).reports)], ['reportDue', true]);
check('отчёт сдан — спокойно', [key(lines({ standing: standing({ submitted: true }) }).reports), due(lines({ standing: standing({ submitted: true }) }).reports)], ['reportDone', false]);
check('без карточки возвещателя — строки нет', lines({ standing: standing({ applicable: false }) }).reports, undefined);
check('месяц назван именем', lines({ standing: standing() }).reports.text.includes('"month":"Сентябрь"'), true);

// The collection — counted, never amber; only the congregation's.
const col = (o) => ({ reportMonth: '2026-09-01', scope: 'congregation', expected: 88, received: 61, deadline: '2026-10-20', pastDeadline: false, closed: false, ...o });
check('сбор: число, без янтаря', [key(lines({ collection: col() }).summary), due(lines({ collection: col() }).summary)], ['collected', false]);
check('сбор после срока — всё равно без янтаря', due(lines({ collection: col({ pastDeadline: true }) }).summary), false);
check('сбор по группе под «Сводкой» не стоит', lines({ collection: col({ scope: 'group' }) }).summary, undefined);

// Attendance — amber only to whoever records it.
const att = (n) => ({ meetings: [], outstandingThisYear: n });
check('посещаемость: пропуски — старейшине без янтаря', [key(lines({ attendance: att(3) }).attendance), due(lines({ attendance: att(3) }).attendance)], ['attendanceMissing', false]);
check('посещаемость: пропуски — записывающему янтарь', due(lines({ attendance: att(3) }, { recordsAttendance: true }).attendance), true);
check('посещаемость: всё записано', [key(lines({ attendance: att(0) }, { recordsAttendance: true }).attendance), due(lines({ attendance: att(0) }, { recordsAttendance: true }).attendance)], ['attendanceDone', false]);

// Field service — whose the meeting is comes from lib/field-audience.
let n = 0;
const fs = (o) => ({ id: `m${++n}`, weekStartDate: '2026-10-05', dayOfWeek: 6, startTime: '10:00', isGeneral: false, serviceGroupId: null, serviceOverseerVisit: false, conductorPublisherId: null, serviceOverseerPublisherId: null, serviceOverseerAssistantId: null, ...o });
check('проповедь: встреч нет', key(lines({ fieldMeetings: [] }).fieldService), 'fieldNone');
check('проповедь: ближайшая — суббота', lines({ fieldMeetings: [fs({})] }).fieldService.text, t('fieldNext', { when: 'сб, 10 октября, 10:00' }));
check('проповедь: прошедший день не считается', key(lines({ fieldMeetings: [fs({ dayOfWeek: 2 })] }).fieldService), 'fieldNone');
check('проповедь: сегодняшняя, уже начавшаяся, не «ближайшая»', key(lines({ fieldMeetings: [fs({ dayOfWeek: 3, startTime: '10:00' })] }).fieldService), 'fieldNone');
check('проповедь: сегодняшняя впереди — «сегодня»', lines({ fieldMeetings: [fs({ dayOfWeek: 3, startTime: '18:00' })] }).fieldService.text, t('fieldNext', { when: 'today, 18:00' }));
check('проповедь: завтра', lines({ fieldMeetings: [fs({ dayOfWeek: 4, startTime: '09:30:00' })] }).fieldService.text, t('fieldNext', { when: 'tomorrow, 09:30' }));
check('проповедь: встреча чужой группы — не моя, беру следующую', lines({ fieldMeetings: [fs({ dayOfWeek: 5, serviceGroupId: 'g-ahlen' }), fs({ dayOfWeek: 6, serviceGroupId: 'g-hamm' })] }).fieldService.text, t('fieldNext', { when: 'сб, 10 октября, 10:00' }));
check('проповедь: визит в чужую группу — не моя', key(lines({ fieldMeetings: [fs({ serviceGroupId: 'g-ahlen', serviceOverseerVisit: true })] }).fieldService), 'fieldNone');
check('проповедь: моя группа на посещении — общая встреча не моя, визит мой', lines({ fieldMeetings: [fs({ startTime: '09:00' }), fs({ startTime: '10:30', serviceGroupId: 'g-hamm', serviceOverseerVisit: true })] }).fieldService.text, t('fieldNext', { when: 'сб, 10 октября, 10:30' }));
check('проповедь: веду сам — «вы проводите»', key(lines({ fieldMeetings: [fs({ conductorPublisherId: 'p-me' })] }).fieldService), 'fieldMine');
check('проповедь: без группы и карточки — любая встреча', key(serviceLines({ ...base, me: null, myGroupId: null, fieldMeetings: [fs({ serviceGroupId: 'g-ahlen' })] }, perms, t, 'ru').fieldService), 'fieldNext');

// Public witnessing.
const slot = (o) => ({ id: 's', date: '2026-10-08', startTime: '10:00', endTime: '12:00', locationId: 'l', locationName: 'Marktplatz', locationKind: 'cart', capacityMax: 3, myRequest: false, ...o });
const week = (o) => ({ id: 'w', weekStartDate: '2026-10-05', status: 'published', startTime: '09:00', endTime: '18:00', stepMinutes: 120, slots: [], ...o });
check('стенды: недели не заведены — строки нет', lines({ cartWeeks: [null, null] }).cart, undefined);
check('стенды: моя смена', lines({ cartWeeks: [week({ slots: [slot({ myAssignment: true })] }), null] }).cart.text, t('cartMine', { when: 'tomorrow, 10:00', place: 'Marktplatz' }));
check('стенды: прошедшая смена не «моя ближайшая»', key(lines({ cartWeeks: [week({ slots: [slot({ date: '2026-10-06', myAssignment: true })] }), null] }).cart), 'cartNotMine');
check('стенды: смена идёт сейчас — ещё моя', key(lines({ cartWeeks: [week({ slots: [slot({ date: TODAY, startTime: '11:00', endTime: '13:00', myAssignment: true })] }), null] }).cart), 'cartMine');
check('стенды: ближайшая из двух', lines({ cartWeeks: [week({ slots: [slot({ date: '2026-10-10', myAssignment: true }), slot({ date: '2026-10-09', startTime: '14:00', myAssignment: true })] }), null] }).cart.text.includes('пт, 9 октября, 14:00'), true);
check('стенды: черновик недели не читается', lines({ cartWeeks: [week({ status: 'draft', slots: [slot({ myAssignment: true })] }), null] }).cart, undefined);
check('стенды: идёт запись', key(lines({ cartWeeks: [week(), week({ weekStartDate: '2026-10-12', status: 'collecting', slots: [slot({ date: '2026-10-13' })] })] }).cart), 'cartCollecting');
check('стенды: заявка подана', key(lines({ cartWeeks: [null, week({ weekStartDate: '2026-10-12', status: 'collecting', slots: [slot({ date: '2026-10-13', myRequest: true })] })] }).cart), 'cartRequested');
check('стенды: назначенная смена важнее записи', key(lines({ cartWeeks: [week({ slots: [slot({ myAssignment: true })] }), week({ status: 'collecting' })] }).cart), 'cartMine');
check('стенды: опубликовано, меня нет', key(lines({ cartWeeks: [week({ slots: [slot({})] }), null] }).cart), 'cartNotMine');
check('стенды: без карточки возвещателя «вы не записаны» не говорится', serviceLines({ ...base, me: null, cartWeeks: [week(), null] }, perms, t, 'ru').cart, undefined);

// The service overseer's visits to the groups.
const g = (o) => ({ serviceGroupId: 'g-hamm', name: 'Hamm', visitsThisYear: 0, madeThisYear: 0, lastVisitDate: null, lastVisitBy: null, nextVisitDate: null, ...o });
const two = (hamm, ahlen) => ({ groups: [g(hamm), g({ serviceGroupId: 'g-ahlen', name: 'Ahlen', ...ahlen })] });
check('посещения: групп нет — строки нет', lines({ groupVisits: { groups: [] } }).serviceOverseer, undefined);
check('посещения: осенью — счёт без янтаря, даже служебному', [lines({ groupVisits: two({}, { madeThisYear: 1, visitsThisYear: 1 }) }, { plansVisits: true }).serviceOverseer.text, due(lines({ groupVisits: two({}, { madeThisYear: 1, visitsThisYear: 1 }) }, { plansVisits: true }).serviceOverseer)], [t('visitsCount', { made: 1, total: 2 }), false]);
const may = (over, p = {}) => serviceLines({ ...base, today: '2027-05-03', ...over }, { ...perms, ...p }, t, 'ru');
check('посещения: с мая — имена и янтарь служебному', [may({ groupVisits: two({}, { madeThisYear: 1 }) }, { plansVisits: true }).serviceOverseer.text, due(may({ groupVisits: two({}, { madeThisYear: 1 }) }, { plansVisits: true }).serviceOverseer)], [t('visitsWaiting', { names: 'Hamm' }), true]);
check('посещения: с мая — остальным без янтаря', due(may({ groupVisits: two({}, { madeThisYear: 1 }) }).serviceOverseer), false);
check('посещения: запланированный визит ещё не сделан', key(may({ groupVisits: two({ visitsThisYear: 1, madeThisYear: 0 }, { madeThisYear: 1 }) }, { plansVisits: true }).serviceOverseer), 'visitsWaiting');
check('посещения: все посещены', key(may({ groupVisits: two({ madeThisYear: 1 }, { madeThisYear: 2 }) }, { plansVisits: true }).serviceOverseer), 'visitsAll');
check('посещения: старый сервер без madeThisYear — по visitsThisYear', key(lines({ groupVisits: { groups: [g({ madeThisYear: undefined, visitsThisYear: 1 })] } }).serviceOverseer), 'visitsAll');
check('посещения: возвещателю — визит в его группу', lines({ groupVisits: two({ nextVisitDate: '2026-10-17' }, {}) }).serviceOverseer.text, t('visitMyGroup', { when: 'сб, 17 октября' }));
check('посещения: служебному — счёт, а не «ваша группа»', key(lines({ groupVisits: two({ nextVisitDate: '2026-10-17' }, {}) }, { plansVisits: true }).serviceOverseer), 'visitsCount');
check('посещения: визит в чужую группу возвещателю не «ваш»', key(lines({ groupVisits: two({}, { nextVisitDate: '2026-10-17' }) }).serviceOverseer), 'visitsCount');

// The circuit overseer's visit.
const ev = (o) => ({ id: 'e', type: 'circuit_overseer_visit', date: '2026-11-10', endDate: '2026-11-15', ...o });
check('районный: событий нет — «не запланирован»', key(lines({ events: [] }).coSchedule), 'coNone');
check('районный: другие события не визит', key(lines({ events: [ev({ type: 'assembly' })] }).coSchedule), 'coNone');
check('районный: ближайший визит', lines({ events: [ev({ date: '2027-03-02', endDate: '2027-03-07' }), ev({})] }).coSchedule.text, t('coNext', { range: '10–15 ноября' }));
check('районный: через границу месяца', lines({ events: [ev({ date: '2026-10-27', endDate: '2026-11-01' })] }).coSchedule.text, t('coNext', { range: '27 октября – 1 ноября' }));
check('районный: визит идёт', key(lines({ events: [ev({ date: '2026-10-06', endDate: '2026-10-11' })] }).coSchedule), 'coNow');
check('районный: прошедший не считается', key(lines({ events: [ev({ date: '2026-09-01', endDate: '2026-09-06' })] }).coSchedule), 'coNone');

// Auxiliary pioneers.
check('подсобные: число', lines({ auxCount: 4 }).auxPioneers.text, t('auxCount', { month: 'Октябрь', count: 4 }));
check('подсобные: никого', key(lines({ auxCount: 0 }).auxPioneers), 'auxNone');
check('подсобные: не загружено — строки нет', lines({ auxCount: null }).auxPioneers, undefined);

if (failures) {
  console.error(`\nСтроки «Служения»: ${failures} не сошлось, ${passed} сошлось`);
  process.exit(1);
}
console.log(`Строки «Служения»: ${passed} случаев сходятся`);
