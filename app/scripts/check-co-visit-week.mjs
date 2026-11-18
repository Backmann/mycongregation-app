/**
 * The visit week as a table and its gaps by day (audit, 17 November 2026).
 *
 * A real visit is the same slots every day — outings at 10:00 and 14:00, a
 * lunch at 12:15, a lunch box — and the work is a name in each. The day list
 * hid the empty ones and the readiness line said «обед не назначен на 1 день»
 * without the day. Guards lib/co-visit-week.ts on a week shaped like the
 * August visit, and the screen's use of it.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-co-visit-week-'));
let failures = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}${detail ? `\n    ${detail}` : ''}`);
  }
};
try {
  const src = readFileSync(join(ROOT, 'lib', 'co-visit-week.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  writeFileSync(join(out, 'week.mjs'), js);
  const { weekRows, weekGaps, WEEK_GRID_FROM, asVisited, wifeStray, wifeComesOf } = await import(
    pathToFileURL(join(out, 'week.mjs'))
  );

  const days = ['2027-02-23', '2027-02-24', '2027-02-25', '2027-02-26', '2027-02-27', '2027-02-28'];
  let n = 0;
  const it = (kind, d, time, who, extra = {}) => ({
    id: `i${++n}`, kind, itemDate: days[d], startTime: time, forWife: false, withWife: false,
    assigneeName: who, assigneeText: null, sortOrder: n, ...extra,
  });
  const items = [
    it('lunch_box', 0, null, 'A'),
    it('field_service', 1, '10:00:00', 'B'),
    it('lunch', 1, '12:15', 'C'),
    it('field_service', 1, '14:00', 'D'),
    it('field_service', 1, '14:00', null, { forWife: true }),
    it('pastoral', 1, '16:00', 'E'),
    it('field_service', 2, '10:00', 'F'),
    it('lunch', 2, '12:15', 'G'),
    it('field_service', 2, '14:00', null),
    it('field_service', 3, '10:00', null, { withWife: true }),
    it('elders', 3, '19:00', null),
    it('lunch_box', 4, null, 'H'),
    it('lunch', 4, '12:15', null),
    it('pastoral', 2, '16:00', null),
    it('lunch', '9', '12:15', 'stranded'),
  ];
  items[items.length - 1].itemDate = '2027-03-05';
  const rows = weekRows(items, days);
  const keys = rows.map((r) => r.key);
  check('rows run by hour, the lunch box last',
    JSON.stringify(keys) === JSON.stringify(['field_service|10:00', 'lunch|12:15', 'field_service|14:00', 'pastoral|16:00', 'elders|19:00', 'lunch_box|']),
    keys.join(', '));
  check('every row has a cell for each day', rows.every((r) => r.cells.length === 6 && r.cells.map((c) => c.date).join() === days.join()));
  const fs14 = rows.find((r) => r.key === 'field_service|14:00');
  check('two items of one slot on one day stand in the same cell', fs14.cells[1].items.length === 2);
  check('an item outside the visit days is not placed in the table',
    !rows.some((r) => r.cells.some((c) => c.items.some((i) => i.assigneeName === 'stranded'))));
  check('a seconds-long hour still lands in its slot', rows[0].cells[1].items[0]?.assigneeName === 'B');

  const g = weekGaps(items, days, false);
  check('accommodation gap', g.accommodation === true);
  check('lunch gaps named by day (Friday and Sunday)', JSON.stringify(g.lunchDays) === JSON.stringify(['2027-02-26', '2027-02-28']), JSON.stringify(g.lunchDays));
  check('partner gaps: his Thursday outing and her Wednesday one, in order',
    JSON.stringify(g.partners.map((p) => [p.date, p.time, p.wife])) ===
      JSON.stringify([['2027-02-24', '14:00', true], ['2027-02-25', '14:00', false]]),
    JSON.stringify(g.partners));
  check('going out with his wife is no gap', !g.partners.some((p) => p.date === '2027-02-26'));
  check('a lunch without a name does not cover its day (Saturday has a named lunch box)', !g.lunchDays.includes('2027-02-27'));
  check('a lunch laid by the template, no host yet, is still a gap', weekGaps([it('lunch', 0, '12:15', null)], [days[0]], true).lunchDays.length === 1);
  check('an old wife copy of a shepherding call is no gap', weekGaps([it('pastoral', 1, '16:00', null, { forWife: true })], days, true).pastoral.length === 0);
  check('a refused template refreshes the week too', /onSettled: \(\) => \{\n\s*invalidate\(\);/.test(readFileSync(join(ROOT, 'app', '(app)', 'cart', 'co-schedule.tsx'), 'utf8')));
  check('a shepherding call without an elder is named', JSON.stringify(g.pastoral.map((p) => [p.date, p.time])) === JSON.stringify([['2027-02-25', '16:00']]), JSON.stringify(g.pastoral));
  check('accommodation set — no gap', weekGaps(items, days, true).accommodation === false);
  check('the table begins at 900 px of content', WEEK_GRID_FROM === 900);

  const screen = readFileSync(join(ROOT, 'app', '(app)', 'cart', 'co-schedule.tsx'), 'utf8');
  check('the screen shows the table when wide', /wideGrid \? renderWeekGrid\(\) : renderDayView\(\)/.test(screen));
  check('the width is measured from the scroller', /onLayout=\{\(e\) => setContentW\(e\.nativeEvent\.layout\.width\)\}/.test(screen));
  check('the form floats in the middle on a wide screen', /variant=\{windowW >= WEEK_GRID_FROM \? 'centered' : 'bottom'\}/.test(screen));
  check('no sky blue left on the screen', !/#0ea5e9/i.test(screen));
  check('no counted gap without its day', !/gapLunches|gapPartners'/.test(screen));
  check('the empty-week template is asked only for an empty week of a coming visit', /canEditCoSchedule &&\n\s*emptyWeek &&\n\s*\(visit\?\.endDate/.test(screen));
  check('the template card is for those who plan, on a coming visit', /if \(!canEditVisit \|\| !emptyWeek \|\| !template\?\.empty/.test(screen));
  check('the template card comes right after the visit and its gaps', /\{renderGaps\(\)\}\n\s*<\/View>\n[^\n]*\n\s*\{renderTemplate\(\)\}/.test(screen));
  // Publishing (18 November 2026): a bar above the week for the planners, a
  // window that names who hears and who must be told by voice.
  check('the publish bar stands above the week', /\{renderPublishBar\(\)\}\n\s*\{wideGrid \? renderWeekGrid\(\) : renderDayView\(\)\}/.test(screen));
  check('the publish bar is for those who plan it', /const renderPublishBar[\s\S]{0,120}if \(!canEditVisit \|\| !publication\) return null;/.test(screen));
  check('every save and undo refreshes the bar', (screen.match(/invalidateQueries\(\{ queryKey: \['co-visit-publication'/g) || []).length >= 4);
  check('no head count in the published toast (unreached people inside)', !/pub\.done', \{ count/.test(screen));
  for (const f of [join(ROOT, 'lib', 'push-notifications.ts'), join(ROOT, 'public', 'service-worker.js')])
    check(`${f.split('/').slice(-2).join('/')}: co_visit opens Home`, /case 'co_visit':\n\s*return \{ path: '\/home'/.test(readFileSync(f, 'utf8')));
  const sheet = readFileSync(join(ROOT, 'components', 'Sheet.tsx'), 'utf8');
  check('a centred window without fills fits its content', /const cardHeight = fills\n/.test(sheet));
  const width = readFileSync(join(ROOT, 'lib', 'screen-width.ts'), 'utf8');
  check('the visit schedule is an overview screen', width.includes("'/cart/co-schedule',"));
  // 18 November 2026: the wife is part of the week only when she comes;
  // shepherding calls are the elders'.
  {
    const w = [
      { id: 'co', forWife: false, withWife: false },
      { id: 'her', forWife: true, withWife: false },
      { id: 'joint', forWife: false, withWife: true },
    ];
    check('she comes: the week as it is', asVisited(w, true) === w);
    check(
      'she stays: no row of hers and no «together»',
      JSON.stringify(asVisited(w, false)) ===
        JSON.stringify([w[0], { id: 'joint', forWife: false, withWife: false }]),
    );
    check('nothing read is changed in place', w[2].withWife === true);
    check('her stray rows are counted', JSON.stringify(wifeStray(w, false)) === '{"outings":1,"together":1}');
    check('none when she comes', JSON.stringify(wifeStray(w, true)) === '{"outings":0,"together":0}');
    check('the visit says whether she comes', wifeComesOf({ coWifeComes: false, coWifeName: 'M' }) === false);
    check('an older server: a name means she comes', wifeComesOf({ coWifeName: ' M ' }) === true && wifeComesOf({ coWifeName: ' ' }) === false);
    const hidden = weekGaps([it('pastoral', 1, '16:00', null, { restricted: true })], days, true);
    check('a call he may not read is not his gap', hidden.pastoral.length === 0);
    const sheetScreen = readFileSync(join(ROOT, 'app', '(app)', 'cart', 'co-schedule.tsx'), 'utf8');
    check('the screen reads the week as visited', /asVisited\(rawItems, wifeComes\)/.test(sheetScreen));
    check('the template still asks for a week empty of every row', /const emptyWeek = !!visit && rawItems !== undefined && rawItems\.length === 0;/.test(sheetScreen));
    check('a call he may not read does not open', /const openEdit = \(it: CoVisitItem\) => \{\n[^\n]*\n\s*if \(it\.restricted\) return;/.test(sheetScreen));
    check('only an elder is offered a new call', /filter\(\(k\) => k !== 'pastoral' \|\| plansCalls\)/.test(sheetScreen));
    check('two sheets, two files', /handlePrint\('congregation'\)/.test(sheetScreen) && /handlePrint\('detail'\)/.test(sheetScreen));
    check('the stray card stands under the template', /\{renderTemplate\(\)\}\n\s*\{renderWifeStray\(\)\}/.test(sheetScreen));
    check('her side of the form follows whether she comes', /!form\.forWife && wifeComes \?/.test(sheetScreen) && !/visit\.coWifeName \? \(\n\s*<View style=\{\[styles\.personBox/.test(sheetScreen));
    check('the undo sends only what the server knows', !/unclearWife\(wifeUndo\.visitId, wifeUndo\)/.test(sheetScreen));
    const formSrc = readFileSync(join(ROOT, 'components', 'SpecialEventForm.tsx'), 'utf8');
    check('the visit form asks whether she comes', /value=\{value\.coWifeComes\}/.test(formSrc));
  }
  for (const lang of ['ru', 'de', 'en']) {
    const se = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
    for (const k of ['wifeComes', 'wifeNameOptional']) check(`${lang}: specialEvents.form.${k}`, !!se.specialEvents.form[k]);
    for (const k of ['callForElders', 'wifeComes', 'wifeStaysName', 'strayKick', 'strayOutings_one', 'strayTogether_one', 'strayWhat', 'strayClear', 'strayCleared', 'sheetCongregation', 'sheetCongregationSub', 'sheetDetail', 'sheetDetailSub'])
      check(`${lang}: coVisit.${k}`, !!se.coVisit[k]);
    check(`${lang}: coVisit.pub.eldersOnly_one`, !!se.coVisit.pub.eldersOnly_one);
    for (const k of ['CO_VISIT_PASTORAL_ELDERS', 'CO_VISIT_NO_WIFE', 'CO_VISIT_WIFE_COMES']) check(`${lang}: serverError.codes.${k}`, !!se.serverError.codes[k]);
    check(`${lang}: journal.fieldNames.coWifeComes`, !!se.journal.fieldNames.coWifeComes);
  }
  for (const lang of ['ru', 'de', 'en']) {
    const c = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).coVisit;
    const jn = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).journal.fieldNames;
    for (const k of ['template_from', 'skipped', 'created']) check(`${lang}: journal.fieldNames.${k}`, !!jn?.[k]);
    for (const k of ['draftTitle', 'publish', 'publishedTitle', 'liveSub', 'dueSub', 'howItGoes', 'tellYourself', 'done', 'nobodyReachable', 'nobodyYet']) check(`${lang}: coVisit.pub.${k}`, !!c?.pub?.[k]);
    for (const k of ['gapLunchOn', 'gapPartnerCo', 'gapPartnerWife', 'gapPastoral', 'gridMeetings', 'tplTitle', 'tplLead', 'tplWhat', 'tplApply', 'tplPrevious'])
      check(`${lang}: coVisit.${k}`, !!c?.[k]);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n✗ Неделя визита: ${failures} из ${failures + passed} проверок не прошли`);
  process.exit(1);
}
console.log(`✓ Неделя визита: ${passed} проверок`);
