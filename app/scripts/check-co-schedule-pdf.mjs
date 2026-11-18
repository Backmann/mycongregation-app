/**
 * The visit programme on paper (audit, 17 November 2026).
 *
 * - The overseer's page keeps EVERY day. It used to drop Tuesday and Sunday
 *   by calendar weekday, so an outing or a lunch on those days reached him
 *   without his partner or host, whatever the visit's own meeting day was.
 * - An outing without a partner says so in words: «— — по домам» printed two
 *   dashes in a row.
 * - The screen builds the visit's meetings from the version of each visit
 *   WEEK, never from today's: with no version in force today it showed none.
 * - Two sheets, two files (18 November 2026): the congregation's sheet holds
 *   the meetings and no name; the detailed one holds everything, the
 *   congregation's meetings included, and a shepherding call read by
 *   someone who is not an elder shows its time only.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-co-schedule-pdf-'));
let failures = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}${detail ? `\n    ${detail}` : ''}`);
  }
};
const emit = (rel, as) => {
  const src = readFileSync(join(ROOT, 'lib', rel), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText.replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'");
  writeFileSync(join(out, as), js);
};
try {
  emit('dates.ts', 'dates.mjs');
  emit('date-range.ts', 'date-range.mjs');
  emit('coSchedulePdf.ts', 'pdf.mjs');
  const { buildCoScheduleHtml } = await import(pathToFileURL(join(out, 'pdf.mjs')));
  const L = new Proxy({}, { get: (_, k) => (k === 'noPartner' ? 'напарник не назначен' : String(k)) });
  const base = {
    forWife: false, withWife: false, startTime: null, placeKind: 'kingdom_hall', cartLocationId: null,
    cartLocationName: null, placeText: 'Hall', assigneePublisherId: null, assigneeName: null,
    assigneeText: null, assigneePhone: null, assigneeAddress: null, note: null, sortOrder: 0,
  };
  // 2027-02-23 is a Tuesday, 2027-02-28 a Sunday.
  const items = [
    { ...base, id: 'a', kind: 'field_service', itemDate: '2027-02-23', startTime: '10:00', assigneeName: 'TuesdayPartner' },
    { ...base, id: 'b', kind: 'lunch', itemDate: '2027-02-28', startTime: '12:15', assigneeName: 'SundayHost' },
    { ...base, id: 'c', kind: 'field_service', itemDate: '2027-02-24', startTime: '14:00', note: 'door to door' },
    { ...base, id: 'd', kind: 'lunch_box', itemDate: '2027-02-24', assigneeName: 'BoxMaker' },
  ];
  const visit = { id: 'v', type: 'circuit_overseer_visit', date: '2027-02-23', endDate: '2027-02-28', coFirstName: 'A', coLastName: 'B', coWifeName: null, coMidweekDow: 3 };
  const html = buildCoScheduleHtml({ sheet: 'detail', visit, items, locale: 'ru', meetings: [], labels: L });
  const page2 = html.slice(html.indexOf('pageForOverseerTitle'));
  check('page 2 exists', html.includes('pageForOverseerTitle'));
  check('the detailed sheet is a file of its own', !html.includes('pageForCongregationTitle'));
  const meetings = [
    { kind: 'midweek', date: '2027-02-23', time: '19:00', place: 'HallPlace', talks: ['ServiceTalk'] },
    { kind: 'weekend', date: '2027-02-28', time: '10:00', place: 'HallPlace', talks: ['PublicTalk'] },
  ];
  const calls = [
    { ...base, id: 'p', kind: 'pastoral', itemDate: '2027-02-24', startTime: '16:00', assigneeName: 'ElderName', note: 'FamilyName', placeKind: null, placeText: null },
    { ...base, id: 'q', kind: 'pastoral', itemDate: '2027-02-25', startTime: '16:00', restricted: true, placeKind: null, placeText: null },
  ];
  const board = buildCoScheduleHtml({ sheet: 'congregation', visit, items: [...items, ...calls], locale: 'ru', meetings, labels: L });
  check('the congregation sheet is a file of its own', board.includes('pageForCongregationTitle') && !board.includes('pageForOverseerTitle'));
  for (const name of ['TuesdayPartner', 'SundayHost', 'BoxMaker', 'ElderName', 'FamilyName'])
    check(`no ${name} on the congregation sheet`, !board.includes(name));
  check('the congregation sheet names the meetings', board.includes('midweekMeeting') && board.includes('ServiceTalk') && board.includes('PublicTalk'));
  const detail = buildCoScheduleHtml({ sheet: 'detail', visit, items: [...items, ...calls], locale: 'ru', meetings, labels: L });
  check('the detailed sheet has the meetings of the day', detail.includes('ServiceTalk') && detail.includes('PublicTalk') && detail.includes('weekendMeeting'));
  check('the detailed sheet has the call for an elder', detail.includes('ElderName') && detail.includes('FamilyName'));
  const tue = detail.slice(detail.indexOf('TuesdayPartner') - 600, detail.indexOf('TuesdayPartner'));
  check('a meeting stands in its day by its hour', detail.indexOf('ServiceTalk') > detail.indexOf('TuesdayPartner') && !tue.includes('ServiceTalk'));
  const restricted = detail.slice(detail.indexOf('2027') >= 0 ? 0 : 0);
  check('a restricted call shows no dash for a missing elder', !/<td class="k">pastoral<\/td>\s*<td><\/td>\s*<td>—<\/td>/.test(restricted));
  check('no page break before the only sheet', !/page-break-before:\s*always/.test(detail));
  check('Tuesday outing with its partner on the overseer page', page2.includes('TuesdayPartner'));
  check('Sunday lunch with its host on the overseer page', page2.includes('SundayHost'));
  check('no double dash for a missing partner', !/—\s*—/.test(html), (html.match(/.{40}—\s*—.{40}/) || [''])[0]);
  check('a missing partner said in words', page2.includes('напарник не назначен — door to door'));
  check('lunch boxes stay off the overseer page', !page2.includes('BoxMaker'));

  const screen = readFileSync(join(ROOT, 'app', '(app)', 'cart', 'co-schedule.tsx'), 'utf8');
  const fn = screen.slice(screen.indexOf('const buildVisitMeetings'), screen.indexOf('const handlePrint'));
  check('meetings never wait for today\'s settings', !/effective\s*;\s*\n\s*if \(!eff\) return \[\]/.test(fn) && !/enabled:\s*!!visit && !!settingsOverview\?\.effective/.test(screen));
  check('meetings use the version of each week', /effectiveVersionFor\(settingsOverview\?\.versions, weekStart\)/.test(fn));

  for (const lang of ['ru', 'de', 'en']) {
    const c = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).coVisit;
    check(`${lang}: noPartner`, !!c?.noPartner);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n✗ График визита на бумаге: ${failures} из ${failures + passed} проверок не прошли`);
  process.exit(1);
}
console.log(`✓ График визита на бумаге: ${passed} проверок`);
