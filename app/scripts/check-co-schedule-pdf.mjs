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
  const html = buildCoScheduleHtml({ visit, items, locale: 'ru', meetings: [], labels: L });
  const page2 = html.slice(html.indexOf('pageForOverseerTitle'));
  check('page 2 exists', html.includes('pageForOverseerTitle'));
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
