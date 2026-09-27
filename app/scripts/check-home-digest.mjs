#!/usr/bin/env node
/**
 * Home's top card and list, checked (26 September).
 *
 * `lib/home-timeline.ts` builds the two weeks on Home and `lib/home-digest.ts`
 * picks «Ваше ближайшее» from them. The cases are the stand's own week —
 * Saturday 26 September 2026, a visit of the service overseer to the group
 * Ahlen on 3 October — plus every rule the card carries: chairing counts, a
 * part before a duty, a meeting that is over is not «ближайшее», an
 * assignment inside an away-period is said to be one.
 *
 * Called directly from the gate, like the other checks — the app has no test
 * runner, and a new npm script would move the Expo fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'home-digest-'));

const MODULES = [
  'home-timeline',
  'home-digest',
  'field-audience',
  'meeting-schedule',
  'dates',
  'week-rules',
  'my-tasks',
  'section-colors',
];
for (const name of MODULES) {
  const src = readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8');
  let js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // Local imports get their extension; `./parts` (which pulls in i18n) and
  // `./api` (types only) are replaced by what the builder needs of them.
  js = js.replace(/from '\.\/([a-z-]+)'/g, (m, dep) =>
    dep === 'api' ? m : `from './${dep}.mjs'`,
  );
  writeFileSync(join(out, `${name}.mjs`), js);
}
writeFileSync(
  join(out, 'parts.mjs'),
  `export const getPartLabel = (k) => k;
export const resolveSubsection = () => 'none';
export const SUBSECTIONS = { none: { label: '', color: '', soft: '' } };\n`,
);
writeFileSync(join(out, 'api.mjs'), 'export {};\n');

const { buildTimeline } = await import(pathToFileURL(join(out, 'home-timeline.mjs')));
const { digestHome, isOver, entryTime } = await import(pathToFileURL(join(out, 'home-digest.mjs')));

let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    passed += 1;
  } else {
    failures += 1;
    console.error(`✗ ${name}\n    получено: ${g}\n    ожидалось: ${w}`);
  }
}

// --- the stand ---------------------------------------------------------------
const TODAY = '2026-09-26'; // Saturday
const HALL = 'Bunsenstr. 46, 59229 Ahlen';
const VERSIONS = [
  {
    effectiveFrom: '2026-01-05',
    midweekDow: 3,
    midweekTime: '19:00',
    weekendDow: 7,
    weekendTime: '13:00',
    address: HALL,
    microphoneSlots: 2,
  },
];
const AHLEN = 'g-ahlen';
const HAMM = 'g-hamm';
const BERGMAN = 'p-bergman';
const BONDAR = 'p-bondar';
const KOVAL = 'p-koval';
const people = new Map(
  [
    [BERGMAN, 'Бергман Павел'],
    [BONDAR, 'Бондарь Виктор'],
    [KOVAL, 'Коваль Олег'],
    ['p-lesch', 'Лещенко Тимофей'],
    ['p-dyach', 'Дьяченко Руслан'],
  ].map(([id, displayName]) => [id, { id, displayName }]),
);
const groups = new Map([
  [AHLEN, 'Ahlen'],
  [HAMM, 'Hamm'],
]);
const field = (id, time, extra) => ({
  id,
  weekStartDate: '2026-09-28',
  dayOfWeek: 6,
  startTime: time,
  address: extra.address ?? 'somewhere',
  serviceGroupId: null,
  isGeneral: false,
  serviceOverseerVisit: false,
  serviceOverseerPublisherId: null,
  serviceOverseerAssistantId: null,
  conductorPublisherId: null,
  topic: null,
  sourceUrl: null,
  ...extra,
});
const SATURDAY = [
  field('f-hamm', '09:30', { serviceGroupId: HAMM, conductorPublisherId: 'p-lesch' }),
  field('f-visit', '10:00', {
    serviceGroupId: AHLEN,
    serviceOverseerVisit: true,
    serviceOverseerPublisherId: BONDAR,
    serviceOverseerAssistantId: KOVAL,
    conductorPublisherId: BONDAR,
  }),
  field('f-open', '10:30', { conductorPublisherId: 'p-dyach' }),
];
const part = (week, eventType, partKey, partOrder, extra = {}) => ({
  kind: 'meeting',
  sortDate: week,
  weekStartDate: week,
  eventType,
  label: partKey,
  partKey,
  partOrder,
  ...extra,
});
const resolvePart = (it) => ({
  section: null,
  title: it.label,
  label: it.label,
  asAssistant: !!it.asAssistant,
  partnerName: it.partnerName ?? null,
});

function run({ me, group, items, absences = [], events = [], nowHM = '20:58', today = TODAY, titles }) {
  const timeline = buildTimeline({
    versions: VERSIONS,
    fieldServiceMeetings: SATURDAY,
    publishersById: people,
    groupNameById: groups,
    myServiceGroupId: group,
    myPublisherId: me,
    events,
    absences,
    myItems: items,
    todayISO: today,
    youConductLabel: 'conduct',
    youVisitLabels: { overseer: 'overseer', assistant: 'assistant' },
    resolvePart,
    meetingTitles: titles,
    nearDays: 14,
  });
  const digest = digestHome({ timeline, todayISO: today, nowHM, absences, events, nearDays: 14 });
  return { timeline, digest };
}
const labels = (en) => (en ? en.myParts.map((p) => p.label) : null);

// --- 1. A publisher of the visited group (Бергман) ---------------------------
{
  const items = [
    part('2026-09-28', 'midweek', 'midweek_chairman', 1),
    part('2026-09-28', 'midweek', 'apply_yourself_1', 5, { asAssistant: true, partnerName: 'Гаврилюк Роман' }),
    part('2026-09-28', 'midweek', 'cbs_reader', 12),
    part('2026-10-05', 'midweek', 'midweek_chairman', 1),
    ...['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'].map((w) =>
      part(w, 'midweek', 'midweek_chairman', 1),
    ),
  ];
  const titles = new Map([
    ['2026-09-21|weekend', { title: 'Как находить радость в служении', speaker: 'Лещенко Тимофей' }],
    ['2026-09-28|midweek', { title: 'Будьте мудрыми в выборе', speaker: null }],
  ]);
  const { timeline, digest } = run({ me: BERGMAN, group: AHLEN, items, titles });
  check('1а ближайшее — среда 30 сентября', digest.next?.dateISO, '2026-09-30');
  check('1б председатель считается и идёт первым', labels(digest.next), ['midweek_chairman', 'apply_yourself_1', 'cbs_reader']);
  check('1в помощник и напарник доходят до карточки', [digest.next.myParts[1].asAssistant, digest.next.myParts[1].partnerName], [true, 'Гаврилюк Роман']);
  check('1г следующее — 7 октября', digest.following?.dateISO, '2026-10-07');
  check('1д «ещё 4, до 4 ноября»', [digest.moreCount, digest.moreUntil], [4, '2026-11-04']);
  check('1е ближайшее в пределах двух недель', digest.nextIsFar, false);
  const sunday = timeline.near.find((g) => g.dateISO === '2026-09-27').entries[0];
  check('1ж воскресенье — тема и докладчик, у себя в зале', [sunday.title, sunday.speaker, sunday.atHall], ['Как находить радость в служении', 'Лещенко Тимофей', true]);
  const sat = timeline.near.find((g) => g.dateISO === '2026-10-03').entries;
  check('1з в день посещения — только посещение своей группы', sat.map((e) => e.key), ['fs-f-visit']);
  check('1и остальное свёрнуто: группа идёт только на посещение', sat[0].folded, { kind: 'groupOnVisit', count: 1 });
  check('1к Бергман не ведёт посещение', sat[0].myRole, null);
}

// --- 2. The service overseer himself (Бондарь, group Hamm) ------------------
{
  const items = [
    part('2026-09-21', 'weekend', 'weekend_closing_prayer', 9),
    part('2026-09-28', 'midweek', 'treasures_talk', 2),
    { kind: 'field_service', sortDate: '2026-09-28', weekStartDate: '2026-09-28', dayOfWeek: 6, time: '10:00', label: 'visit', serviceOverseerVisit: true },
  ];
  const { timeline, digest } = run({ me: BONDAR, group: HAMM, items });
  check('2а ближайшее — завтрашняя молитва', [digest.next?.dateISO, labels(digest.next)], ['2026-09-27', ['weekend_closing_prayer']]);
  const sat = timeline.near.find((g) => g.dateISO === '2026-10-03').entries;
  check('2б в день посещения — одна строка', sat.map((e) => e.key), ['fs-f-visit']);
  check('2в он ведёт посещение', sat[0].myRole, 'conduct');
  check('2г встречи своей группы и открытая свёрнуты: у вас посещение', sat[0].folded, { kind: 'youOnVisit', count: 2 });
}

// --- 3. Somebody with no group sees the whole Saturday -----------------------
{
  const { timeline } = run({ me: 'p-admin', group: null, items: [] });
  const sat = timeline.near.find((g) => g.dateISO === '2026-10-03').entries;
  check('3 без группы — все три встречи, ничего не свёрнуто', [sat.map((e) => e.key), sat.map((e) => e.folded ?? null)], [['fs-f-hamm', 'fs-f-visit', 'fs-f-open'], [null, null, null]]);
}

// --- 4. A part of the programme before a duty --------------------------------
{
  const items = [
    { kind: 'duty', sortDate: '2026-09-28', weekStartDate: '2026-09-28', eventType: 'midweek', label: 'microphone', slotIndex: 0 },
    part('2026-09-28', 'midweek', 'midweek_opening_prayer', 3),
  ];
  const { digest } = run({ me: 'p-x', group: null, items });
  check('4 часть программы впереди обязанности', labels(digest.next), ['midweek_opening_prayer', 'microphone']);
  check('4б обязанность помечена', digest.next.myParts.map((p) => !!p.isDuty), [false, true]);
  // The rule is the kind, not an accident of numbering: a duty that did come
  // with an order (the server sends none today) still goes after the part.
  const numbered = [{ ...items[0], partOrder: 0 }, items[1]];
  check('4в и с номером обязанность после части', labels(run({ me: 'p-x', group: null, items: numbered }).digest.next), ['midweek_opening_prayer', 'microphone']);
}

// --- 5. Today's meeting: «ближайшее» while it is on, not after -------------
{
  const items = [
    part('2026-09-21', 'weekend', 'weekend_opening_prayer', 2),
    part('2026-09-28', 'midweek', 'midweek_chairman', 1),
  ];
  const sunday = '2026-09-27';
  check('5а в 12:00 — сегодняшняя встреча', run({ me: 'p-x', group: null, items, today: sunday, nowHM: '12:00' }).digest.next?.dateISO, sunday);
  check('5б в 14:30 ещё идёт', run({ me: 'p-x', group: null, items, today: sunday, nowHM: '14:30' }).digest.next?.dateISO, sunday);
  check('5в в 15:00 закончилась — ближайшее уже среда', run({ me: 'p-x', group: null, items, today: sunday, nowHM: '15:00' }).digest.next?.dateISO, '2026-09-30');
  check('5г строка без часа не «заканчивается»', isOver({ type: 'absence', dateISO: sunday }, sunday, '23:59'), false);
}

// --- 6. An assignment inside one's own away-period ---------------------------
{
  const away = { id: 'a1', startDate: '2026-09-29', endDate: '2026-10-02', note: null };
  const items = [part('2026-09-28', 'midweek', 'midweek_chairman', 1)];
  const { digest } = run({ me: 'p-x', group: null, items, absences: [away] });
  check('6а отъезд назван', digest.awayDuring?.id, 'a1');
  const { digest: d2 } = run({ me: 'p-x', group: null, items, absences: [{ ...away, startDate: '2026-10-01' }] });
  check('6б отъезд после встречи не мешает', d2.awayDuring, null);
}

// --- 7. Nothing in two weeks, something later -------------------------------
{
  const items = [part('2026-10-26', 'weekend', 'weekend_chairman', 1)];
  const { digest } = run({ me: 'p-x', group: null, items });
  check('7а ближайшее — за двумя неделями', [digest.next?.dateISO, digest.nextIsFar], ['2026-11-01', true]);
  check('7б больше ничего', [digest.following, digest.moreCount], [null, 0]);
  const { digest: none } = run({ me: 'p-x', group: null, items: [] });
  check('7в назначений нет вовсе', [none.next, none.moreCount, none.moreUntil], [null, 0, null]);
}

// --- 8. «Скоро» ---------------------------------------------------------------
{
  const ev = (id, type, date, extra = {}) => ({ id, type, date, endDate: null, title: id, ...extra });
  const events = [
    ev('congress', 'regional_convention', '2026-10-23', { endDate: '2026-10-25' }),
    ev('co-far', 'circuit_overseer_visit', '2026-12-01'),
    ev('co-near', 'circuit_overseer_visit', '2026-10-05', { endDate: '2026-10-11' }),
    ev('other', 'other', '2026-10-20'),
  ];
  const { digest } = run({ me: 'p-x', group: null, items: [], events });
  check('8 «Скоро»: конгресс через 4 недели; не то, что уже в ленте, не дальше двух месяцев, не прочее', digest.soon.map((e) => e.id), ['congress']);
}

// --- 9. Own group's cleaning after the meetings makes the meeting one's own --
{
  const items = [{ kind: 'cleaning', sortDate: '2026-09-28', weekStartDate: '2026-09-28', label: 'after_meeting' }];
  const { digest } = run({ me: 'p-x', group: null, items });
  check('9 уборка после встреч — своё', [digest.next?.dateISO, digest.next?.weeklyCleaning], ['2026-09-30', true]);
}

// --- 10. An event held as the meeting goes into its row (27 September) -----
{
  const ev = (id, type, date, extra = {}) => ({ id, type, date, endDate: null, time: null, title: id, replacesMeeting: false, ...extra });
  const events = [
    ev('special', 'special_talk', '2026-09-27', { time: '13:00', title: 'Как Библия может вам помочь?' }),
    ev('special-late', 'special_talk', '2026-10-04', { time: '16:00' }),
    ev('campaign', 'other', '2026-09-01', { endDate: '2026-09-30' }),
  ];
  const { timeline } = run({ me: 'p-x', group: null, items: [], events });
  const sunday = timeline.near.find((g) => g.dateISO === '2026-09-27').entries;
  check('10а специальная речь в час встречи — внутри строки встречи', sunday.filter((e) => e.type === 'meeting').map((e) => e.occasion?.id ?? null), ['special']);
  check('10б и отдельной строкой её нет', sunday.some((e) => e.key === 'ev-special'), false);
  const later = timeline.near.find((g) => g.dateISO === '2026-10-04').entries;
  check('10в в другой час — своей строкой', [later.some((e) => e.key === 'ev-special-late'), later.find((e) => e.type === 'meeting')?.occasion ?? null], [true, null]);
  check('10г кампания на месяц не вкладывается во встречу', timeline.near[0].entries.some((e) => e.key === 'ev-campaign'), true);
}

// --- 11. Cleaning after the meetings beyond the two weeks is counted --------
{
  const cleaning = (week) => ({ kind: 'cleaning', sortDate: week, weekStartDate: week, label: 'after_meeting' });
  const items = [cleaning('2026-09-28'), cleaning('2026-10-19'), cleaning('2026-11-23')];
  const { timeline, digest } = run({ me: 'p-x', group: null, items });
  const nearTasks = timeline.near.flatMap((g) => g.entries).filter((e) => e.type === 'task');
  check('11а в две недели — внутри строк встреч, своей строкой нет', [nearTasks.length, timeline.near.flatMap((g) => g.entries).filter((e) => e.weeklyCleaning).length], [0, 2]);
  check('11б дальше — в счёте «ещё N»', [digest.moreCount, digest.moreUntil], [2, '2026-11-23']);
}

// --- 12. The announcement reaches the row as given --------------------------
{
  const agenda = [{ partKey: 'living_christians_1', n: 7, text: 'Местные потребности', mine: true }];
  const titles = new Map([['2026-09-28|midweek', { title: 'Будьте мудрыми в выборе', speaker: null, titlePartKey: 'treasures_talk', titleIsMine: false, agenda }]]);
  const { timeline } = run({ me: 'p-x', group: null, items: [], titles });
  const wed = timeline.near.find((g) => g.dateISO === '2026-09-30').entries[0];
  check('12 анонс и своё в нём доходят до строки', [wed.agenda, wed.titlePartKey, wed.titleIsMine], [agenda, 'treasures_talk', false]);
}

// --- 13. The weekly cleaning sits on its planned day, at its planned hour --
{
  // Built from this clock's own midnight-thirty, so the case holds in any
  // time zone: cut from the UTC string, it fell on the day before in Berlin.
  const planned = new Date(2026, 9, 8, 0, 30).toISOString();
  const items = [{ kind: 'cleaning', sortDate: '2026-10-05', weekStartDate: '2026-10-05', label: 'thorough', windows: [3, 5], thoroughPlannedAt: planned }];
  const { digest } = run({ me: 'p-x', group: null, items });
  check('13 еженедельная уборка — в свой день и час', [digest.next?.dateISO, entryTime(digest.next)], ['2026-10-08', '00:30']);
}

if (failures) {
  console.error(`\nГлавная: ${failures} из ${passed + failures} не сходятся.`);
  process.exit(1);
}
console.log(`Главная: ${passed} случаев сходятся.`);
