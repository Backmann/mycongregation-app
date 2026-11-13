/**
 * A territory divided between groups (lib/division.ts, 13 November 2026):
 * how a piece of a long street is named, what counts as walked, the colour
 * of a part, the route; and the words of its screens in ru, de, en.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-division-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'division.ts'), 'utf8');
  writeFileSync(
    join(out, 'division.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const D = await import(pathToFileURL(join(out, 'division.mjs')));
  const st = (o) => ({ key: 'k', name: 'Lang', from: null, to: null, piece: 1, pieces: 1, houses: 10, walkedAt: null, ...o });

  // A piece is named by the streets that cross where it is cut.
  check('a whole street needs no words', D.pieceWords(st({})), { key: 'whole' });
  check('the middle piece: from … to', D.pieceWords(st({ piece: 2, pieces: 3, from: 'A', to: 'B' })),
    { key: 'between', from: 'A', to: 'B' });
  check('the first piece: up to', D.pieceWords(st({ piece: 1, pieces: 3, to: 'A' })), { key: 'upTo', to: 'A' });
  check('the last piece: from … to the end', D.pieceWords(st({ piece: 3, pieces: 3, from: 'B' })), { key: 'from', from: 'B' });
  check('no crossing street: its number', D.pieceWords(st({ piece: 2, pieces: 3, from: 'A' })),
    { key: 'nth', piece: 2, pieces: 3 });
  check('a middle piece crossed at one end only: its number, not «up to»', D.pieceWords(st({ piece: 2, pieces: 3, to: 'B' })),
    { key: 'nth', piece: 2, pieces: 3 });
  check('no crossing at all: its number', D.pieceWords(st({ piece: 1, pieces: 2 })), { key: 'nth', piece: 1, pieces: 2 });

  const part = (n, streets) => ({ n, houses: streets.reduce((a, s) => a + s.houses, 0), streets });
  const p1 = part(1, [st({ key: 'a', houses: 10, walkedAt: '2026-11-13T09:42:00Z' }), st({ key: 'b', houses: 5 })]);
  const p2 = part(2, [st({ key: 'c', houses: 7, walkedAt: '2026-11-13T10:00:00Z' })]);
  check('walked across parts', D.walkedOf([p1, p2]), { streets: 3, streetsWalked: 2, houses: 22, housesWalked: 17 });
  check('a part is done when every street is', [D.partDone(p1), D.partDone(p2), D.partDone(part(3, []))], [false, true, false]);
  check('streets still to walk come first', D.streetsToWalk(p1.streets).map((s) => s.key), ['b', 'a']);

  // «Пары на участке»: sides, numbers, the pair across, ticks without a connection.
  check('a quiet street has no side word', D.sideWord(st({ side: null })), null);
  check('a side by its numbers first', D.sideWord(st({ side: { parity: 'even', toward: 'n' } })), 'even');
  check('a side without numbers: by the compass', D.sideWord(st({ side: { parity: null, toward: 'w' } })), 'w');
  check('a range of numbers', D.rangeText(st({ range: { from: '2', to: '84' } })), '2–84');
  check('one number is no range', D.rangeText(st({ range: { from: '7', to: '7' } })), '7');
  check('no numbers, no range', D.rangeText(st({ range: null })), null);
  const road = (key, parity, toward) => st({ key, name: 'Heessener Straße', side: { parity, toward } });
  const across = [part(1, [road('h@1', 'odd', 's')]), part(2, [road('h@2', 'even', 'n'), st({ key: 'd', name: 'Dillweg' })])];
  check('the pair across the road, by numbers', D.partAcross(across, 2, across[1].streets[0]), 1);
  check('a quiet street has nobody across', D.partAcross(across, 2, across[1].streets[1]), null);
  check('the same side is not across',
    D.partAcross([part(1, [road('x', 'even', 'n')]), part(2, [road('y', 'even', 'n')])], 2, road('y', 'even', 'n')), null);
  check('across by the compass when numbers are missing',
    D.partAcross([part(1, [road('x', null, 's')]), part(2, [road('y', null, 'n')])], 2, road('y', null, 'n')), 1);
  const q1 = D.addTick([], { key: 'a', walked: true, at: 'T1' });
  const q2 = D.addTick(q1, { key: 'b', walked: true, at: 'T2' });
  const q3 = D.addTick(q2, { key: 'a', walked: false, at: 'T3' });
  check('a newer tick of a street replaces the older, order kept', q3.map((q) => `${q.key}${q.walked ? '+' : '-'}`), ['b+', 'a-']);
  const shown = D.withTicks([st({ key: 'a', walkedAt: '2026-11-13T09:00:00Z' }), st({ key: 'b' }), st({ key: 'c' })], q3);
  check('waiting ticks are shown as made', shown.map((x) => [x.key, !!x.walkedAt, x.pending]),
    [['a', false, true], ['b', true, true], ['c', false, false]]);
  check('walking order numbered from 1', D.walkingOrder(p1.streets).map((x) => `${x.key}${x.step}`), ['a1', 'b2']);
  check('marking the territory worked: all walked and allowed', [
    D.offerComplete([p2], true), D.offerComplete([p2], false), D.offerComplete([p1, p2], true), D.offerComplete([], true),
  ], [true, false, false, false]);
  const fresh = { ...part(3, [st({ key: 'e' }), st({ key: 'f' })]), untouched: true };
  const begun = { ...part(4, [st({ key: 'g' }), st({ key: 'h', walkedAt: '2026-11-13T09:00:00Z' })]), untouched: false };
  check('a street is taken only from a pair not started, never from oneself',
    D.streetsToTake([p2, fresh, begun], 2).map((x) => `${x.from}:${x.street.key}`), ['3:e', '3:f']);
  const mine = { ...part(5, [st({ key: 'm' })]), untouched: true };
  check('never a street of one\'s own part', D.streetsToTake([mine, fresh], 5).map((x) => x.street.key), ['e', 'f']);
  check('the server saying «started» is believed', D.streetsToTake([{ ...fresh, untouched: false }], 2), []);

  check('a colour per part, wrapping after eight', [D.partColor(1), D.partColor(9)], [D.PART_COLORS[0], D.PART_COLORS[0]]);
  check('eight different colours', new Set(D.PART_COLORS).size, 8);
  check('the route to a point: lat,lon', D.routeTo([7.81234567, 51.70987654]),
    'https://www.google.com/maps/dir/?api=1&destination=51.70988,7.81235');
  check('no point, no route', D.routeTo(null), null);
  check('a clock of two digits', /^\d\d:\d\d$/.test(D.clockOf('2026-11-13T08:05:00Z')), true);

  // Every word the screens use, in every language, with the plural forms.
  const used = new Set();
  for (const f of [
    'app/(app)/cart/division/[id].tsx',
    'app/p/[token].tsx',
    'components/territories/StreetLine.tsx',
    'components/territories/DivisionButton.tsx',
  ]) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/'(territories\.(?:division|part)\.[A-Za-z.]+)'/g)) used.add(m[1]);
  }
  // Words picked by a variable: every side and both ways of dividing.
  for (const w of ['both', 'even', 'odd', 'n', 's', 'e', 'w']) used.add(`territories.division.side.${w}`);
  for (const w of ['near', 'nearHint', 'own', 'ownHint']) used.add(`territories.division.mode.${w}`);
  check('the screens use their words', used.size > 60, true);
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
    check(`${lang}: every word of the division`, missing, []);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ division: ${passed} passed`);
