/**
 * «Выдача и приём» (lib/desk.ts, 13 November 2026): who is at the desk,
 * whom to go up to today, how a name is found, which free territory comes
 * first and which he had; and the words of the screen in ru, de, en.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-desk-'));
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}
try {
  const src = readFileSync(join(ROOT, 'lib', 'desk.ts'), 'utf8');
  writeFileSync(
    join(out, 'desk.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const D = await import(pathToFileURL(join(out, 'desk.mjs')));
  const today = '2026-11-13';
  const person = (id, name, hasApp = true) => ({ publisherId: id, name, pioneer: false, serviceGroupId: null, hasApp });
  const held = (id, number, publisherId, dueOn, holderName = 'x') => ({
    assignmentId: `a-${id}`, territoryId: `t-${number}`, number, locality: null, publisherId, holderName,
    forGroupId: null, forGroupName: null, assignedOn: '2026-07-01', dueOn, extended: false, paperWanted: false,
  });
  const people = [person('p1', 'Петров Иван'), person('p2', 'Jörg Müller', false), person('p3', 'Орлов Андрей')];
  const out1 = [
    held(1, 'Hamm42', 'p1', '2026-11-03'),
    held(2, 'Hamm17', 'p1', '2027-02-01'),
    held(3, 'Hamm55', 'p3', '2026-11-19'),
    held(4, 'Ahlen05', null, '2026-11-12', 'Старый Держатель'),
  ];
  const entries = D.entriesOf(people, out1, today);
  const by = (k) => entries.find((e) => e.key === k);
  check('everyone at the desk once', entries.length, 4);
  check('his late days', by('p1').late, 10);
  check('his holds, nearest day first', by('p1').holds.map((h) => h.number), ['Hamm42', 'Hamm17']);
  check('a holder without a card is there by name', entries.find((e) => !e.publisherId)?.name, 'Старый Держатель');
  check('without a card: no app', entries.find((e) => !e.publisherId).hasApp, false);
  const att = D.attentionOf(entries);
  check('late: most late first', att.late.map((e) => e.name), ['Петров Иван', 'Старый Держатель']);
  check('soon: within two weeks', att.soon.map((e) => e.name), ['Орлов Андрей']);
  check('find by part of a name', D.searchDesk(entries, 'иван').map((e) => e.name), ['Петров Иван']);
  check('find by two parts in any order', D.searchDesk(entries, 'иван петров').map((e) => e.name), ['Петров Иван']);
  check('accents folded', D.searchDesk(entries, 'jorg').map((e) => e.name), ['Jörg Müller']);
  check('find by a territory he holds', D.searchDesk(entries, 'hamm17').map((e) => e.name), ['Петров Иван']);
  check('nothing typed, nothing found', D.searchDesk(entries, '  '), []);

  const rows = [
    { id: 'r1', number: 'Hamm08', locality: null, lastCompletedOn: '2026-06-11', holder: null },
    { id: 'r2', number: 'Hamm63', locality: null, lastCompletedOn: '2025-03-01', holder: null },
    { id: 'r3', number: 'Hamm14', locality: null, lastCompletedOn: '2026-05-02', holder: null },
    { id: 'r4', number: 'Hamm99', locality: null, lastCompletedOn: null, holder: null },
    { id: 'r5', number: 'Hamm42', locality: null, lastCompletedOn: null, holder: { x: 1 } },
    { id: 'r6', number: 'G-1', locality: null, category: 'business', lastCompletedOn: null, holder: null },
  ];
  const history = [
    { publisherId: 'p1', territoryId: 'r3', assignedOn: '2026-01-10', completedOn: '2026-05-02', returnedOn: null },
    { publisherId: 'p1', territoryId: 'r1', assignedOn: '2025-12-01', completedOn: null, returnedOn: '2026-01-05' },
    { publisherId: 'p2', territoryId: 'r2', assignedOn: '2025-02-01', completedOn: '2025-03-01', returnedOn: null },
    // This service year (from 1 September 2026); the ones above are the last.
    { publisherId: 'p1', territoryId: 'r9', assignedOn: '2026-08-20', completedOn: '2026-10-04', returnedOn: null },
    { publisherId: 'p1', territoryId: 'r8', assignedOn: '2026-09-10', completedOn: null, returnedOn: '2026-10-01' },
  ];
  const free = D.freeFor(rows, { publisherId: 'p1', history, houses: { r1: 120, r2: 140 }, noCalls: { r2: 2 }, today });
  check('free only, homes only; never worked, then longest ago', free.map((f) => f.row.number), ['Hamm99', 'Hamm63', 'Hamm14', 'Hamm08']);
  check('he had it: marked with the day', free.find((f) => f.row.number === 'Hamm14').hadOn, '2026-01-10');
  check('someone else had it: not his', free.find((f) => f.row.number === 'Hamm63').hadOn, null);
  check('a year or more: long ago', free.map((f) => f.longAgo), [true, true, false, false]);
  check('houses and do-not-call carried', [free[1].houses, free[1].noCalls, free[0].houses], [140, 2, 0]);
  check('business asked: business only', D.freeFor(rows, { publisherId: null, history, houses: null, noCalls: {}, today, category: 'business' }).map((f) => f.row.number), ['G-1']);
  check('no register: no houses', D.freeFor(rows, { publisherId: null, history, houses: null, noCalls: {}, today })[0].houses, null);

  check('his year: worked, back, days', D.yearOf(history, 'p1', today), { worked: 1, returned: 1, avgDays: 45 });
  check('nothing this year', D.yearOf(history, 'p2', today), { worked: 0, returned: 0, avgDays: null });
  check('days between', [D.daysBetween('2026-11-03', today), D.daysBetween(today, '2026-11-13')], [10, 0]);

  // Every word the screen uses, in every language.
  const used = new Set();
  for (const f of ['app/(app)/cart/desk.tsx', 'components/territories/HandOver.tsx']) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/'(territories\.(?:desk|handover)\.[A-Za-z.]+)'/g)) used.add(m[1]);
  }
  check('the screen uses its words', used.size > 20, true);
  const forms = { ru: ['one', 'few', 'many', 'other'], de: ['one', 'other'], en: ['one', 'other'] };
  const lookup = (obj, key) => key.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
  for (const lang of ['ru', 'de', 'en']) {
    const loc = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
    const missing = [];
    for (const key of used) {
      if (typeof lookup(loc, key) === 'string') continue;
      const parent = lookup(loc, key.split('.').slice(0, -1).join('.')) ?? {};
      const leaf = key.split('.').pop();
      if (forms[lang].every((f) => typeof parent[`${leaf}_${f}`] === 'string')) continue;
      missing.push(key);
    }
    check(`${lang}: every word of the desk`, missing, []);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ desk: ${passed} passed`);
