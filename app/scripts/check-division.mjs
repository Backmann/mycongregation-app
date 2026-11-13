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
  check('the screens use their words', used.size > 30, true);
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
