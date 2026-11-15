/**
 * The buildings of a territory as the keepers look at them (lib/homes.ts,
 * 15 November 2026): what each one is on the map, which to look at, in
 * what order.
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
const out = mkdtempSync(join(ROOT, '.check-homes-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'homes.ts'), 'utf8');
  writeFileSync(
    join(out, 'homes.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const H = await import(pathToFileURL(join(out, 'homes.mjs')));
  const h = (key, o) => ({
    key, lon: 7, lat: 51, areaM2: 100, numbers: null, label: null, near: null,
    official: 'Wohngebäude', use: 'home', home: true, byRule: true, mark: null, pieceOf: null, ...o,
  });
  const house = h('1', { label: 'Ahornweg 12', numbers: '12' });
  const annex = h('2', { near: { label: 'Ahornweg 12', m: 12 }, home: false, byRule: false, pieceOf: 'Ahornweg 12' });
  const shed = h('3', { near: { label: 'Ahornweg 12', m: 25 }, official: 'Sonstiges', use: 'unsure', home: false, byRule: false });
  const barn = h('4', { label: 'Ahornweg 20', official: 'Gebäude für Land- und Forstwirtschaft', use: 'not', home: false, byRule: false });
  const fresh = h('5', { label: 'Birkenweg 2', official: null, use: null });
  const marked = h('6', { label: 'Ahornweg 2', official: 'Sonstiges', use: 'unsure', home: true, byRule: false, mark: true });

  check('a house is a home', H.stateOf(house), 'home');
  check('a further piece is drawn as a piece, not as «not a home»', H.stateOf(annex), 'piece');
  check('the cadastre unsure: to look at', H.stateOf(shed), 'unsure');
  check('the cadastre silent: to look at too', H.stateOf(fresh), 'unsure');
  check('a barn is not a home', H.stateOf(barn), 'not');
  check('a mark is what it says, unsure or not', H.stateOf(marked), 'home');
  check('a piece marked a home is a home', H.stateOf({ ...annex, mark: true, home: true }), 'home');

  const all = [barn, shed, house, fresh, marked, annex];
  check('to look at: unsure or silent, not yet marked', H.filterHomes(all, 'unsure').map((x) => x.key), ['3', '5']);
  check('not homes', H.filterHomes(all, 'not').map((x) => x.key), ['4', '3', '2']);
  check('marked', H.filterHomes(all, 'marked').map((x) => x.key), ['6']);
  check('by street and number: 2 before 12, a shed after its house', H.byStreet(all).map((x) => x.key), ['6', '1', '2', '3', '4', '5']);
  check('the first to look at', H.nextToLookAt(all, null)?.key, '3');
  check('… then the next', H.nextToLookAt(all, '3')?.key, '5');
  check('… round to the first', H.nextToLookAt(all, '5')?.key, '3');
  check('none left: null', H.nextToLookAt([house, barn], null), null);
  check('the colours differ in lightness, not only hue', H.HOME_COLORS.home.fill !== H.HOME_COLORS.piece.fill, true);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`✗ homes: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ homes: ${passed} passed`);
