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
  'event-meeting',
  'field-moves',
  'invitations',
  'group-name',
  'home-changes',
  'date-range',
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
// The programme's fixed names in the reader's language need i18n; the
// builder's rules do not depend on them (23 October 2026).
writeFileSync(
  join(out, 'reader-titles.mjs'),
  `export const readerTitle = (x) => x ?? '';
export const readerTitleOrNull = (x) => x ?? null;\n`,
);

const { buildTimeline, clockPlus } = await import(pathToFileURL(join(out, 'home-timeline.mjs')));
const { digestHome, isOver, entryTime, splitHome, isWeekChore } = await import(pathToFileURL(join(out, 'home-digest.mjs')));

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

function run({ me, group, items, absences = [], events = [], moves = [], nowHM = '20:58', today = TODAY, titles }) {
  const timeline = buildTimeline({
    versions: VERSIONS,
    fieldServiceMeetings: SATURDAY,
    publishersById: people,
    groupNameById: groups,
    myServiceGroupId: group,
    myPublisherId: me,
    events,
    moves,
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
  // 10 November 2026: the one who goes to another group's visit sees the
  // day's other meetings in full, each with the hour of his visit.
  check('2б в день посещения — все встречи дня, по времени', sat.map((e) => e.key), ['fs-f-hamm', 'fs-f-visit', 'fs-f-open']);
  const visit = sat.find((e) => e.key === 'fs-f-visit');
  check('2в он ведёт посещение', visit.myRole, 'conduct');
  check('2г ничего не свёрнуто', sat.map((e) => e.folded ?? null), [null, null, null]);
  check('2д у остальных — час его посещения',
    sat.filter((e) => e !== visit).map((e) => [e.fieldNote?.kind, e.fieldNote?.groupName, e.fieldNote?.visitTime]),
    [['awayOnVisit', 'Ahlen', '10:00'], ['awayOnVisit', 'Ahlen', '10:00']]);
  // Beyond the two weeks only his own rows are drawn: the visit's row names
  // what else the congregation has that day.
  const far = run({ me: BONDAR, group: HAMM, items, today: '2026-09-14', nowHM: '09:00' });
  const farVisit = [...far.timeline.near, ...far.timeline.far]
    .flatMap((g) => g.entries)
    .find((e) => e.type === 'task' && e.task.item.kind === 'field_service');
  check('2е посещение за двумя неделями — «в этот день также»',
    [farVisit?.dateISO, farVisit?.alsoThatDay],
    ['2026-10-03', [
      { time: '09:30', audience: 'group', groupName: 'Hamm', own: true },
      { time: '10:30', audience: 'open', groupName: '', own: false },
    ]]);
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
  // An event for the invited is an invitation: from the day it is entered,
  // however far ahead (10 November 2026) — but not one already in the list.
  const { digest: invited } = run({
    me: 'p-x', group: null, items: [],
    events: [
      ...events,
      ev('school-far', 'kingdom_ministry_school_elders', '2027-02-07'),
      ev('school-near', 'kingdom_ministry_school_elders', '2026-10-01'),
    ],
  });
  check('8а «Скоро»: школа через четыре месяца — да; в ближайших двух неделях — нет', invited.soon.map((e) => e.id), ['congress', 'school-far']);
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

// --- 14. A branch representative's day: the meeting goes ahead WITH CHANGES --
{
  // Sunday 4 October: the meeting starts at 10:00 in another hall; the row
  // shows it at that hour and place and says it goes ahead differently.
  const events = [
    {
      id: 'ev-branch',
      title: 'Посещение представителя филиала',
      type: 'branch_representative_visit',
      date: '2026-10-04',
      endDate: null,
      time: '10:00',
      replacesMeeting: false,
      meetingMode: 'changed',
      meetingNote: 'Речь представителя вместо публичной',
      meetingTime: '10:00',
      meetingAddress: 'Westfalenhalle, Dortmund',
    },
  ];
  const { timeline } = run({ me: 'p-x', group: null, items: [], events });
  const sun = timeline.near
    .flatMap((g) => g.entries)
    .find((e) => e.type === 'meeting' && e.dateISO === '2026-10-04');
  check(
    '14 день представителя: встреча в новый час и в новом месте, с пометкой',
    [sun?.time, sun?.address, sun?.atHall, sun?.meetingChanged, sun?.meetingChangeNote, sun?.occasion?.id],
    ['10:00', 'Westfalenhalle, Dortmund', false, true, 'Речь представителя вместо публичной', 'ev-branch'],
  );
  check(
    '14б и своей строкой событие не повторяется',
    timeline.near.flatMap((g) => g.entries).some((e) => e.key === 'ev-ev-branch'),
    false,
  );
}

// --- 15. His parts in the order the meeting runs, each at its minute -------
// (28 September). The stored order of an imported week puts the Bible study
// at 13 and the closing prayer at 15, while the template's reader keeps 21:
// sorted by it, «чтец» stood after «заключительная молитва».
{
  const W = '2026-09-28';
  const items = [
    part(W, 'midweek', 'cbs_reader', 21),
    part(W, 'midweek', 'midweek_closing_prayer', 15),
    { ...part(W, 'midweek', 'microphone', undefined), kind: 'duty', partKey: undefined, label: 'Микрофон 1' },
    part(W, 'midweek', 'midweek_opening_prayer', 2),
    part(W, 'midweek', 'midweek_chairman', 1),
  ];
  const partStarts = { midweek_chairman: 0, midweek_opening_prayer: 0, cbs_conductor: 66, cbs_reader: 66, midweek_closing_prayer: 96 };
  const titles = new Map([[`${W}|midweek`, { title: null, speaker: null, agenda: [], partStarts }]]);
  const { timeline, digest } = run({ me: BERGMAN, group: AHLEN, items, titles });
  const wed = timeline.near.find((g) => g.dateISO === '2026-09-30').entries.find((e) => e.type === 'meeting');
  check(
    '15а по ходу встречи, обязанность последней',
    labels(wed),
    ['midweek_chairman', 'midweek_opening_prayer', 'cbs_reader', 'midweek_closing_prayer', 'Микрофон 1'],
  );
  check('15б минуты от начала — у частей, у обязанности нет', wed.myParts.map((p) => p.offsetMin), [0, 0, 66, 96, null]);
  check('15в часы на карточке', wed.myParts.map((p) => (p.offsetMin == null ? null : clockPlus(wed.time, p.offsetMin))), ['19:00', '19:00', '20:06', '20:36', null]);
  check('15г карточка берёт ту же встречу', digest.next?.key, wed.key);
  check('15д часы: не время — ничего', [clockPlus('', 5), clockPlus(null, 5), clockPlus('9:05', 60)], [null, null, '10:05']);
}

// --- 16. Two talks elsewhere on one Sunday (22 October 2026) ----------------
// Each talk wrote its own away-period. Home showed the first talk only, an
// «В отъезде» row for the second, and warned «сообщите» against the trip.
{
  const SUN = '2026-10-04';
  const talk = (time, congregationName) => ({
    kind: 'outgoing_talk',
    sortDate: SUN,
    date: SUN,
    weekStartDate: '2026-09-28',
    time,
    label: '№78. Служи Иегове с радостью!',
    partKey: `talk-${time}`,
    congregationName,
  });
  const away = (id, note) => ({ id, publisherId: BERGMAN, startDate: SUN, endDate: SUN, note });
  const items = [talk('16:30', 'Paderborn'), talk('14:00', 'Rheda'), part('2026-10-05', 'midweek', 'midweek_chairman', 1)];
  const absences = [away('a1', '№78 · Rheda'), away('a2', '№78 · Paderborn')];
  const { timeline, digest } = run({ me: BERGMAN, group: AHLEN, items, absences });
  const day = timeline.near.find((g) => g.dateISO === SUN).entries;
  check('16а один день — одна строка выезда, без строки «в отъезде»', day.map((e) => e.type), ['outgoing_talk']);
  check('16б оба доклада, по часам', day[0].talks.map((r) => r.item.time), ['14:00', '16:30']);
  check('16в оба отъезда объяснены этим днём', day[0].absences.map((a) => a.id), ['a1', 'a2']);
  check('16г ближайшее — этот день', digest.next?.key, day[0].key);
  check('16д без «сообщите»: отъезд объяснён', digest.awayDuring, null);
  check('16е следующее — уже не второй доклад, а среда', digest.following?.dateISO, '2026-10-07');
}

// --- 16b. A longer away-period of his own around the talk ---------------------
{
  const SUN = '2026-10-04';
  const items = [{ kind: 'outgoing_talk', sortDate: SUN, date: SUN, weekStartDate: '2026-09-28', time: '14:00', label: 'Тема', congregationName: 'Rheda' }];
  const absences = [{ id: 'weekend', publisherId: BERGMAN, startDate: '2026-10-03', endDate: SUN, note: null }];
  const { timeline, digest } = run({ me: BERGMAN, group: AHLEN, items, absences });
  const sat = timeline.near.find((g) => g.dateISO === '2026-10-03').entries;
  check('16ж свой отъезд на два дня остаётся строкой в субботу', sat.some((e) => e.type === 'absence' && e.absence.id === 'weekend'), true);
  check('16з и не превращается в «сообщите» у доклада', digest.awayDuring, null);
}

// --- 17. A part of mine on a day I am away -----------------------------------
{
  const W = '2026-10-05';
  const items = [part('2026-09-28', 'midweek', 'midweek_chairman', 1), part(W, 'midweek', 'bible_reading', 4)];
  const absences = [{ id: 'school', publisherId: BERGMAN, startDate: '2026-10-07', endDate: '2026-10-07', note: 'Школа' }];
  const { timeline } = run({ me: BERGMAN, group: AHLEN, items, absences });
  const wed = timeline.near.find((g) => g.dateISO === '2026-10-07').entries.find((e) => e.type === 'meeting');
  check('17а часть в день отъезда — конфликт на самой строке', wed.awayConflict?.id, 'school');
  const first = timeline.near.find((g) => g.dateISO === '2026-09-30').entries.find((e) => e.type === 'meeting');
  check('17б без отъезда — без конфликта', first.awayConflict ?? null, null);
}

// --- 18. A meeting moved for one week (4 November 2026) ----------------------
// The midweek meeting of 28 September moved from Wednesday 30th 19:00 to
// Thursday 1 October 18:30: the row, its hour and the brother's part go there.
{
  const items = [part('2026-09-28', 'midweek', 'midweek_chairman', 1)];
  const moves = [
    { id: 'm1', weekStartDate: '2026-09-28', eventType: 'midweek', date: '2026-10-01', time: '18:30', address: null },
  ];
  const { timeline, digest } = run({ me: BERGMAN, group: AHLEN, items, moves });
  const meetingOn = (d) =>
    (timeline.near.find((g) => g.dateISO === d)?.entries ?? []).filter((e) => e.type === 'meeting');
  // The old day keeps a crossed-out stand-in that says where it went
  // (5 November 2026) — nobody's part, never the «next» card.
  check(
    '18а в старый день — только отметка, куда перенесена',
    meetingOn('2026-09-30').map((e) => [e.cancelled, e.movedTo, e.movedToTime, e.myParts.length]),
    [[true, '2026-10-01', '18:30', 0]],
  );
  check('18д на новой — откуда', [meetingOn('2026-10-01')[0].movedFrom, meetingOn('2026-10-01')[0].movedFromTime], ['2026-09-30', '19:00']);
  check('18б она в новый день, в новый час', meetingOn('2026-10-01').map((e) => e.time), ['18:30']);
  check('18в моя часть — с ней', labels(meetingOn('2026-10-01')[0]), ['midweek_chairman']);
  check('18г ближайшее — новый день', digest.next?.dateISO, '2026-10-01');
}

// --- 19. Variant Б: what goes where after the card (9 November 2026) -------
{
  const mtg = (key, dateISO, extra = {}) => ({ type: 'meeting', key, dateISO, kind: 'midweek', time: '19:00', myParts: [], weeklyCleaning: false, ...extra });
  const task = (key, dateISO) => ({ type: 'task', key, dateISO, task: { item: { kind: 'cart', time: '10:00' } } });
  const ev = (key, dateISO) => ({ type: 'event', key, dateISO, event: { id: key, type: 'regional_convention' } });
  const timeline = {
    near: [
      { dateISO: '2026-11-10', entries: [task('cart-10', '2026-11-10')] },
      { dateISO: '2026-11-11', entries: [mtg('old-11', '2026-11-11', { cancelled: true, movedTo: '2026-11-12' })] },
      { dateISO: '2026-11-12', entries: [mtg('new-12', '2026-11-12', { movedFrom: '2026-11-11' }), task('cart-12', '2026-11-12')] },
      { dateISO: '2026-11-14', entries: [mtg('fs-14', '2026-11-14', { kind: 'field_service', notice: 'другой зал' })] },
      { dateISO: '2026-11-15', entries: [mtg('we-15', '2026-11-15', { kind: 'weekend', myParts: [{ partKey: 'x' }] })] },
      { dateISO: '2026-11-20', entries: [ev('congress', '2026-11-20')] },
    ],
    far: [
      { dateISO: '2026-11-25', entries: [mtg('mw-25', '2026-11-25', { myParts: [{ partKey: 'y' }] }), mtg('mw-25-bg', '2026-11-25')] },
    ],
  };
  const keys = (xs) => xs.map((e) => e.key);
  const sp = splitHome(timeline, 'cart-10');
  // Variant A (19 November 2026): the two weeks are one list, his own rows
  // of any kind in their own day; «Дальше у вас» is only beyond them.
  check('19а «Ближайшие две недели» — все дни, своё в своём дне',
    sp.meetings.map((g) => [g.dateISO, keys(g.entries)]),
    [['2026-11-10', ['cart-10']], ['2026-11-11', ['old-11']], ['2026-11-12', ['new-12', 'cart-12']], ['2026-11-14', ['fs-14']], ['2026-11-15', ['we-15']], ['2026-11-20', ['congress']]]);
  check('19б «Дальше у вас» — только своё после двух недель', keys(sp.ahead), ['mw-25']);
  // «Важно» is no longer a list of its own (10 November 2026): a meeting
  // that is different says it in its own row, which stays where it is.
  check('19в нет отдельного «Важно»: перемены говорит сама строка встречи',
    Object.keys(sp).sort(), ['ahead', 'meetings']);
  const sp2 = splitHome(timeline, 'new-12');
  check('19г перенесённая встреча с карточки остаётся строкой в «Встречах собрания»',
    sp2.meetings.some((g) => keys(g.entries).includes('new-12')), true);
  check('19д карточка не повторяется в «Дальше у вас»', keys(splitHome({ near: [], far: timeline.far }, 'mw-25').ahead), []);
  const { isPlainMeeting } = await import(pathToFileURL(join(out, 'home-digest.mjs')));
  check('19е одной строкой — только встреча без своего и без перемен',
    ['old-11', 'new-12', 'fs-14', 'we-15'].map((k) => isPlainMeeting(timeline.near.flatMap((g) => g.entries).find((e) => e.key === k))),
    [false, false, false, false]);
  check('19ж обычная встреча без своего — одной строкой', isPlainMeeting(mtg('plain', '2026-11-18')), true);
  check('19з встреча с номером для «Изменено» — не одной строкой', isPlainMeeting(mtg('ids', '2026-11-18', { agendaIds: ['part:x'] })), false);
}

// --- 20. «Изменено» finds its row: each row lists its own agenda ids --------
// (9 November 2026). The parts and the duty of the week's midweek meeting,
// the cleaning after the meetings on both rows, the field service he
// conducts; a far meeting likewise; nothing for a row that is not his.
{
  const W = '2026-09-28';
  const items = [
    part(W, 'midweek', 'bible_reading', 5, { agendaId: 'part:a1' }),
    { ...part(W, 'midweek', 'microphone', undefined), kind: 'duty', partKey: undefined, label: 'Микрофон 1', agendaId: 'duty:d1' },
    part(W, 'weekend', 'weekend_chairman', 1, { agendaId: 'part:w1' }),
    { kind: 'cleaning', sortDate: W, weekStartDate: W, label: 'after_meeting', agendaId: 'cleaning:c1' },
    part('2026-10-26', 'midweek', 'bible_reading', 5, { agendaId: 'part:far' }),
  ];
  const { timeline } = run({ me: 'p-lesch', group: HAMM, items });
  const all = [...timeline.near, ...timeline.far].flatMap((g) => g.entries);
  const ids = (key) => all.find((e) => e.key === key)?.agendaIds;
  check('20а будний день: часть, обязанность, уборка', ids('midweek-2026-09-30'), ['part:a1', 'duty:d1', 'cleaning:c1']);
  check('20б выходные: своя часть и та же уборка', ids('weekend-2026-10-04'), ['part:w1', 'cleaning:c1']);
  check('20в встреча для проповеди, которую он проводит', ids('fs-f-hamm'), ['field_service:f-hamm']);
  check('20г чужая встреча для проповеди — ничего', ids('fs-f-open'), []);
  const farMtg = all.find((e) => e.type === 'meeting' && e.dateISO === '2026-10-28' && e.myParts.length);
  check('20д дальняя встреча — её часть', farMtg?.agendaIds, ['part:far']);
}

// --- 21. The meeting with the pioneers: who conducts it, on the row ---------
// (9 November 2026). Two may conduct it: the invited read both, a conductor
// reads the other one; one alone reads as before.
{
  const { taskMeta } = await import(pathToFileURL(join(out, 'my-tasks.mjs')));
  const t = (k, o) => `${k}${o ? JSON.stringify(o) : ''}`;
  const row = (item) => ({ item: { kind: 'pioneer_meeting', sortDate: '2026-12-05', date: '2026-12-05', ...item } });
  const meta = (item) => taskMeta(row(item), t, 'ru');
  check(
    '21а приглашённый: оба проводящих',
    meta({ label: 'invited', partnerName: 'A, B', partnerNames: ['A', 'B'] }).includes('home.pioneerMeeting.byTwo{"a":"A","b":"B"}'),
    true,
  );
  check(
    '21б проводящий: второй проводящий',
    meta({ label: 'conduct', partnerName: 'B', partnerNames: ['B'] }).includes('home.pioneerMeeting.with{"name":"B"}'),
    true,
  );
  check('21в проводящий один: о себе ничего', meta({ label: 'conduct' }).includes('pioneerMeeting'), false);
  check(
    '21г старый сервер: одно имя — «проводит»',
    meta({ label: 'invited', partnerName: 'A' }).includes('home.pioneerMeeting.by{"name":"A"}'),
    true,
  );
}

// 18 November 2026 (Lionel's phone): a weekday row was titled by its first
// talk and his own part stood under it as «2.» in orange — nobody could
// tell what was his. Now: a weekday is titled by what it is, never by a
// part; his own stands only in one block, each line under words that say
// whose it is; a video's length is said as one, not beside a clock.
{
  const home = readFileSync(join(ROOT, 'app', '(app)', 'home', 'index.tsx'), 'utf8');
  check('22а будни не берут заголовок из первой речи', /agenda\[0\]\.text/.test(home), false);
  check('22б своё — блоком с подписью', /<MineBlock entry=\{en\} title=\{title\} \/>/.test(home), true);
  // Variant A (19 November 2026): no capital «ВЫ»; what it is, in words, under
  // the name — duty, assistant, partner.
  check('22в что это — словами под названием', /t\("home\.mine\.duty"\)/.test(home) && /t\("home\.mine\.helper"\)/.test(home), true);
  check('22г уборка группы — в том же блоке', /home\.mine\.yourGroup/.test(home), true);
  const meta = readFileSync(join(ROOT, 'components', 'FieldMeetingBlock.tsx'), 'utf8');
  check('22д длина видео — со словом «видео», не у часов', /fieldService\.videoLength/.test(meta) && !/time-outline/.test(meta), true);
  const moved = readFileSync(join(ROOT, 'components', 'MovedMark.tsx'), 'utf8');
  check('22е «перенесена» не оранжевая', /#c2410c|#fff7ed|#9a3412/.test(moved), false);
  for (const lang of ['ru', 'de', 'en']) {
    const d = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
    for (const k of ['duty', 'helper', 'yourGroup', 'cleaning'])
      check(`22ж ${lang}: home.mine.${k}`, !!d.home.mine?.[k], true);
    check(`22ж ${lang}: fieldService.videoLength`, !!d.fieldService.videoLength, true);
  }
}

// --- 23. Step 1 of the Home review (18 November 2026) ------------------------
{
  const allOf = (tl) => [...tl.near, ...tl.far].flatMap((g) => g.entries);
  // а. A meeting another event replaces is not held: his leftover part on it
  // must not make it «Ваше ближайшее».
  {
    const items = [
      part('2026-09-28', 'midweek', 'bible_reading', 5),
      part('2026-09-28', 'weekend', 'weekend_chairman', 1),
    ];
    const events = [{ id: 'ev-talk', type: 'special_talk', date: '2026-09-30', replacesMeeting: true }];
    const { digest } = run({ me: BERGMAN, group: AHLEN, items, events });
    check('23а заменённая встреча не «ближайшее»', digest.next?.dateISO, '2026-10-04');
  }
  // б. A chore for the whole week (no day, no hour) does not take the card.
  {
    const items = [
      { kind: 'cleaning', sortDate: '2026-09-28', weekStartDate: '2026-09-28', label: 'general' },
      part('2026-09-28', 'midweek', 'bible_reading', 5),
    ];
    const { timeline, digest } = run({ me: BERGMAN, group: AHLEN, items });
    check('23б уборка на всю неделю не «ближайшее»', [digest.next?.type, digest.next?.dateISO], ['meeting', '2026-09-30']);
    const chore = allOf(timeline).find((e) => e.type === 'task' && e.task.item.kind === 'cleaning');
    check('23б′ это дело недели', !!chore && isWeekChore(chore), true);
  }
  // в. A cleaning with a chosen day sits on that day, whatever its label.
  {
    const items = [
      { kind: 'cleaning', sortDate: '2026-09-28', weekStartDate: '2026-09-28', label: 'general', thoroughPlannedAt: '2026-10-01T12:00:00Z' },
    ];
    const { timeline } = run({ me: BERGMAN, group: AHLEN, items });
    const day = timeline.near.find((g) => g.entries.some((e) => e.type === 'task'));
    check('23в уборка с выбранным днём — в этот день', day?.dateISO, '2026-10-01');
  }
  // г. The Memorial further out is the Memorial.
  {
    const items = [part('2027-03-22', 'memorial', 'memorial_prayer', 1)];
    const events = [{ id: 'mem-27', type: 'memorial', date: '2027-03-23' }];
    const { timeline } = run({ me: BERGMAN, group: AHLEN, items, events });
    const far = timeline.far.flatMap((g) => g.entries).find((e) => e.type === 'meeting');
    check('23г дальняя Вечеря знает своё событие', far?.memorial?.id ?? null, 'mem-27');
  }
  // д. The cleaning after the meetings further out goes into his meeting rows
  // of that week; a week with no row of his keeps its own row.
  {
    const clean = (w) => ({ kind: 'cleaning', sortDate: w, weekStartDate: w, label: 'after_meeting' });
    const items = [
      part('2026-11-02', 'midweek', 'bible_reading', 5),
      clean('2026-11-02'),
      clean('2026-11-09'),
    ];
    const { timeline } = run({ me: BERGMAN, group: AHLEN, items });
    const far = timeline.far.flatMap((g) => g.entries);
    const cleaningWeeks = far.filter((e) => e.type === 'task' && e.task.item.kind === 'cleaning').map((e) => e.task.item.weekStartDate);
    check('23д дальняя уборка недели со встречей — внутри строки', cleaningWeeks, ['2026-11-09']);
    check('23д′ строка встречи несёт уборку', far.some((e) => e.type === 'meeting' && e.weekStartISO === '2026-11-02' && e.weeklyCleaning), true);
  }
  // е. Group names inside a sentence: «Ваша группа 2», not «группа Группа 2».
  {
    const { groupInSentence } = await import(pathToFileURL(join(out, 'group-name.mjs')));
    check('23е «Группа 2» в предложении', ['Группа 2', 'Group 3', 'Gruppe Nord', 'Группа', 'Ahlen'].map(groupInSentence), ['2', '3', 'Nord', 'Группа', 'Ahlen']);
    const home = readFileSync(join(ROOT, 'app', '(app)', 'home', 'index.tsx'), 'utf8');
    const tasks = readFileSync(join(ROOT, 'lib', 'my-tasks.ts'), 'utf8');
    check('23е″ строка посещения тоже', /forGroup', \{ name: item\.groupName/.test(tasks), false);
    check('23е′ Главная не вставляет имя группы как есть', /group: (en|x|en\.fieldNote)\.groupName\b|name: en\.groupName\b/.test(home), false);
    // ж. Dates beyond this year carry the year; same-hour lines share a label.
    check('23ж даты другого года — с годом', (home.match(/year: "numeric"|year: ['"]auto['"]/g) ?? []).length >= 5, true);
    check('23з у каждой своей строки — своё время справа, без заглавных подписей', /s\.mineTime/.test(home) && !/home\.mine\.you\b/.test(home), true);
  }
}

// --- 24. Variant A, the rest (19 November 2026) -------------------------------
{
  const { entryAgendaIds } = await import(pathToFileURL(join(out, 'home-changes.mjs')));
  const base = {
    versions: VERSIONS, fieldServiceMeetings: SATURDAY, publishersById: people, groupNameById: groups,
    myServiceGroupId: AHLEN, myPublisherId: BERGMAN, events: [], moves: [], absences: [],
    todayISO: TODAY, youConductLabel: 'conduct', youVisitLabels: { overseer: 'overseer', assistant: 'assistant' },
    resolvePart, nearDays: 14,
  };
  // а. A lunch of the visit comes once: the visit item, not the copy from
  // /me/assignments; «Изменено» finds it by the same id.
  const lunch = { id: 'lunch-1', kind: 'lunch_box', itemDate: '2026-10-01', startTime: null, assigneePublisherId: BERGMAN };
  const tl = buildTimeline({
    ...base,
    coVisits: [{ visit: { id: 'v1', title: 'visit', date: '2026-09-29', endDate: '2026-10-04' }, items: [lunch] }],
    myItems: [{ kind: 'co_lunch', sortDate: '2026-10-01', date: '2026-10-01', label: 'lunch_box', agendaId: 'co_visit:lunch-1' }],
  });
  const rows = [...tl.near, ...tl.far].flatMap((g) => g.entries).filter((e) => (e.type === 'task' && e.task.item.kind === 'co_lunch') || e.type === 'co_visit');
  check('24а ланч визита — одна строка', rows.map((e) => e.type), ['co_visit']);
  check('24а′ «Изменено» находит её по тому же номеру', rows[0] ? entryAgendaIds(rows[0]) : null, ['co_visit:lunch-1']);
  // б. A far part carries its hour where the week's programme is loaded.
  const titles = new Map([['2026-11-02|midweek', { title: null, speaker: null, partStarts: { bible_reading: 21 } }]]);
  const tl2 = buildTimeline({ ...base, meetingTitles: titles, myItems: [part('2026-11-02', 'midweek', 'bible_reading', 5, { agendaId: 'part:far2' })] });
  const far = tl2.far.flatMap((g) => g.entries).find((e) => e.type === 'meeting');
  check('24б дальняя часть знает своё время', far?.myParts?.[0]?.offsetMin ?? null, 21);
  check('24б′ и свой номер для «Изменено»', far?.myParts?.[0]?.agendaId ?? null, 'part:far2');
}

// --- 25. Variant A: one line, the away band, «Следом» (19 November 2026) ----
{
  const { isSlimDay, awaySegments } = await import(pathToFileURL(join(out, 'home-digest.mjs')));
  const m = (key, dateISO, extra = {}) => ({ type: 'meeting', key, dateISO, kind: 'midweek', time: '19:00', myParts: [], weeklyCleaning: false, ...extra });
  const fs = (key, dateISO, extra = {}) => m(key, dateISO, { kind: 'field_service', time: '10:00', ...extra });
  const mine = [{ label: 'x', partKey: 'x' }];
  // а. One line only when nothing is his but the card, and nothing different.
  check('25а день без своего — одной строкой', isSlimDay({ dateISO: 'd', entries: [m('a', 'd'), fs('b', 'd')] }, null), true);
  check('25б своё не на карточке — полной строкой', isSlimDay({ dateISO: 'd', entries: [m('a', 'd', { myParts: mine })] }, null), false);
  check('25в своё на карточке — одной строкой', isSlimDay({ dateISO: 'd', entries: [m('a', 'd', { myParts: mine })] }, 'a'), true);
  check('25г карточка с переменой (Вечеря, перенос) — полной строкой',
    [{ memorial: { id: 'x' } }, { movedFrom: '2026-01-01' }, { notice: 'n' }, { occasion: { id: 'e' } }].map((x) =>
      isSlimDay({ dateISO: 'd', entries: [m('a', 'd', { myParts: mine, ...x })] }, 'a')),
    [false, false, false, false]);
  // The card's own row of another kind is one line too (19 November 2026);
  // one that is not on the card is said in full.
  check('25д своё не-встреча на карточке — одной строкой', isSlimDay({ dateISO: 'd', entries: [{ type: 'task', key: 't', dateISO: 'd', task: { item: { kind: 'cart' } } }] }, 't'), true);
  check('25д′ своё не-встреча не на карточке — полной строкой', isSlimDay({ dateISO: 'd', entries: [{ type: 'task', key: 't', dateISO: 'd', task: { item: { kind: 'cart' } } }] }, null), false);
  // б. The away band: covers its days, hides plain field service, never his own.
  const ab = (id, startDate, endDate, dateISO) => ({ type: 'absence', key: `abs-${id}`, dateISO, absence: { id, startDate, endDate } });
  const groups = [
    { dateISO: '2026-11-19', entries: [ab('A', '2026-11-10', '2026-11-20', '2026-11-19'), fs('f1', '2026-11-19')] },
    { dateISO: '2026-11-20', entries: [fs('f2', '2026-11-20', { myParts: mine })] },
    { dateISO: '2026-11-21', entries: [fs('f3', '2026-11-21')] },
    { dateISO: '2026-11-25', entries: [ab('B', '2026-11-25', null, '2026-11-25')] },
    { dateISO: '2026-11-26', entries: [m('w', '2026-11-26')] },
  ];
  const seg = awaySegments(groups);
  const shape = seg.map((sg) => [sg.away.map((a) => a.id).join('+'), sg.groups.map((g) => [g.dateISO, g.entries.map((e) => e.key)])]);
  check('25е полосы: уехал до сегодня, вернулся; отсутствие без конца — один день',
    shape,
    [
      ['A', [['2026-11-19', []], ['2026-11-20', ['f2']]]],
      ['', [['2026-11-21', ['f3']]]],
      ['B', [['2026-11-25', []]]],
      ['', [['2026-11-26', ['w']]]],
    ]);
  // Nothing that carries «Изменено» is ever left out: Home marks changes seen.
  const kept = new Set(seg.flatMap((sg) => sg.groups.flatMap((g) => g.entries.map((e) => e.key))));
  const dropped = groups.flatMap((g) => g.entries).filter((e) => e.type !== 'absence' && !kept.has(e.key));
  check('25ж из полосы уходит только чужая проповедь', dropped.map((e) => [e.key, e.myParts.length]), [['f1', 0]]);
  const two = awaySegments([
    { dateISO: '2026-11-19', entries: [ab('A', '2026-11-19', '2026-11-22', '2026-11-19'), ab('C', '2026-11-19', '2026-11-19', '2026-11-19')] },
    { dateISO: '2026-11-20', entries: [m('w2', '2026-11-20')] },
  ]);
  check('25з два отсутствия в один день — оба в голове полосы', two.map((sg) => sg.away.map((a) => a.id)), [['A', 'C'], ['A']]);
  // в. Home says a part with a partner as a fact (Lionel, 19 November 2026):
  // no «Следом», no agreeing on preparing on Home — that is in «Мои назначения».
  const homeSrc = readFileSync(join(ROOT, 'app', '(app)', 'home', 'index.tsx'), 'utf8');
  check('25и на Главной нет подготовки с напарником', /PairPrep|pickThen|ThenBlock/.test(homeSrc), false);
  // Agreeing on preparing is gone from the app (19 November 2026): unused,
  // and «не получится» under a part read as refusing it.
  const { existsSync } = await import('node:fs');
  check('25к в приложении нет «договориться о подготовке»', existsSync(join(ROOT, 'components', 'PairPrep.tsx')) || /pairPrepApi/.test(readFileSync(join(ROOT, 'lib', 'api.ts'), 'utf8')), false);
}

// --- 26. Closing the review (19 November 2026) --------------------------------
{
  // а. A day he serves at the pioneer school is his row; the school's own
  // absence for that day is not «В отъезде».
  const tl = buildTimeline({
    versions: VERSIONS, fieldServiceMeetings: SATURDAY, publishersById: people, groupNameById: groups,
    myServiceGroupId: AHLEN, myPublisherId: BERGMAN, events: [], moves: [],
    absences: [{ id: 'sch-abs', startDate: '2026-09-30', endDate: '2026-09-30', pioneerSchoolDutyId: 'duty-1' }],
    todayISO: TODAY, youConductLabel: 'conduct', youVisitLabels: { overseer: 'overseer', assistant: 'assistant' },
    resolvePart, nearDays: 14,
    myItems: [{ kind: 'pioneer_school', sortDate: '2026-09-30', date: '2026-09-30', time: '09:30', label: 'Школа', agendaId: 'pioneer_school:s:2026-09-30', schoolDuties: [{ type: 'av' }] }],
  });
  const all = [...tl.near, ...tl.far].flatMap((g) => g.entries);
  check('26а день на Школе — своя строка', all.filter((e) => e.type === 'task' && e.task.item.kind === 'pioneer_school').map((e) => e.dateISO), ['2026-09-30']);
  check('26б отсутствие от Школы — не «В отъезде»', all.filter((e) => e.type === 'absence').length, 0);
  // в. Every sentence that says «группа» before a group's name takes the
  // name through groupInSentence — «группа Группа 2» on any screen.
  const ru = JSON.parse(readFileSync(join(ROOT, 'locales', 'ru.json'), 'utf8'));
  const tpl = (k) => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), ru);
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : /\.tsx?$/.test(f) ? [p] : [];
  });
  const bad = [];
  for (const file of ['app', 'components', 'lib'].flatMap((d) => walk(join(ROOT, d)))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/t\(\s*["']([a-zA-Z.]+)["'],\s*\{[^}]*?\bgroup:\s*([^,}]+)/g)) {
      const text = tpl(m[1]);
      const expr = m[2].trim();
      const ident = (/^([A-Za-z_]\w*)/.exec(expr) ?? [])[1];
      // A helper or a variable defined through groupInSentence counts.
      const viaHelper =
        !!ident && new RegExp(`(const|let)\\s+${ident}\\s*=[^;]*?groupInSentence`, 's').test(src);
      if (typeof text === 'string' && /(груп\S*|group|grupp\S*)\s*\{\{group\}\}/i.test(text) && !/groupInSentence/.test(expr) && !viaHelper)
        bad.push(`${file.slice(ROOT.length + 1)}: ${m[1]}`);
    }
  }
  check('26в «группа» + имя группы — через groupInSentence', bad, []);
  // г. Today's row of his that is over says so.
  const home = readFileSync(join(ROOT, 'app', '(app)', 'home', 'index.tsx'), 'utf8');
  check('26г сегодняшняя прошедшая строка — с пометкой', /isOver\(en, todayISO, nowHM\)/.test(home), true);
  // д. In a day of his own only someone else's PLAIN meeting goes into one
  // line — never his own row, which may carry «Изменено».
  check('26д одной строкой в своём дне — только чужая обычная встреча собрания', /en\.kind !== "field_service" &&\s*isPlainMeeting\(en\)/.test(home), true);
  // е. Field service (Lionel, 19 November 2026): named «Встреча для проповеди»
  // with whose it is and its topic; several on one day — in full, as usual.
  const { isSlimDay: slimDay } = await import(pathToFileURL(join(out, 'home-digest.mjs')));
  const fsm = (key, extra = {}) => ({ type: 'meeting', key, dateISO: 'd', kind: 'field_service', time: '10:00', myParts: [], weeklyCleaning: false, ...extra });
  check('26е одна встреча для проповеди — одной строкой', slimDay({ dateISO: 'd', entries: [fsm('a')] }, null), true);
  check('26ж две встречи для проповеди в день — подробно', slimDay({ dateISO: 'd', entries: [fsm('a'), fsm('b', { time: '11:00' })] }, null), false);
  check('26з подпись, вид и тема у строки проповеди', /sub: fieldTitle\(field\[0\], myGroupName, t\)/.test(home) && /topic: field\[0\]\.topic/.test(home), true);
  for (const lang of ['ru', 'en', 'de']) {
    const d = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
    check(`26и ${lang}: строка проповеди названа встречей`, d.home.slim.field !== d.feed.kindField, true);
  }
}

// --- 27. The phone, 19 November 2026 -----------------------------------------
{
  // а. A brother at the pioneer school on some days only: each of his days
  // keeps its row; the first says it all.
  const school = (date, duty) => ({ kind: 'pioneer_school', sortDate: date, date, label: 'Школа', agendaId: `pioneer_school:S1:${date}`, schoolDuties: [{ type: duty }] });
  const tl = buildTimeline({
    versions: VERSIONS, fieldServiceMeetings: SATURDAY, publishersById: people, groupNameById: groups,
    myServiceGroupId: AHLEN, myPublisherId: BERGMAN, events: [], moves: [], absences: [],
    todayISO: TODAY, youConductLabel: 'conduct', youVisitLabels: { overseer: 'overseer', assistant: 'assistant' },
    resolvePart, nearDays: 14,
    myItems: [school('2026-09-28', 'av'), school('2026-09-30', 'av'), school('2026-10-02', 'ventilation')],
  });
  const rows = [...tl.near, ...tl.far].flatMap((g) => g.entries).filter((e) => e.type === 'task' && e.task.item.kind === 'pioneer_school');
  check('27а каждый его день Школы — своя строка', rows.map((e) => e.dateISO), ['2026-09-28', '2026-09-30', '2026-10-02']);
  check('27б подробно только первая', rows.map((e) => e.schoolFirst), [true, false, false]);
  check('27в все знают его дни', rows[2]?.schoolDays, ['2026-09-28', '2026-09-30', '2026-10-02']);
  // б. Dates on a phone without formatRange: short within a month.
  const { formatDayRange, formatDayList } = await import(pathToFileURL(join(out, 'date-range.mjs')));
  const keep = Intl.DateTimeFormat.prototype.formatRange;
  delete Intl.DateTimeFormat.prototype.formatRange;
  try {
    check('27г неделя на телефоне — «7–13 декабря»', formatDayRange('2026-12-07', '2026-12-13', 'ru', { year: 'never' }), '7–13 декабря');
    check('27д немецкая — с точкой', formatDayRange('2026-12-07', '2026-12-13', 'de', { year: 'never' }), '7.–13. Dezember');
    check('27е его дни Школы — «23, 25, 27 ноября»', formatDayList(['2026-11-27', '2026-11-23', '2026-11-25'], 'ru').replace(/ \d{4} г\.$/, ''), '23, 25, 27 ноября');
  } finally {
    Intl.DateTimeFormat.prototype.formatRange = keep;
  }
  // в. The hall's name is not said twice.
  const home = readFileSync(join(ROOT, 'app', '(app)', 'home', 'index.tsx'), 'utf8');
  check('27ж адрес без повтора названия зала', /function hallPlace/.test(home) && /hallPlace\(it\.location\)/.test(home), true);
}

if (failures) {
  console.error(`\nГлавная: ${failures} из ${passed + failures} не сходятся.`);
  process.exit(1);
}
console.log(`Главная: ${passed} случаев сходятся.`);
