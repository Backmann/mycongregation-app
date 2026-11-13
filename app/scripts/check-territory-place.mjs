/**
 * The territory checks (13 November 2026): a place handed between screens
 * as `?at=lon,lat` (lib/territory-place.ts) is read strictly, and every key
 * the checks window says (components/territories/TerritoryChecks.tsx) is
 * there in ru, de and en — with each plural form a count needs.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-tplace-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'territory-place.ts'), 'utf8');
  writeFileSync(
    join(out, 'tp.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { placeOf, boxWith, groupDigits, holderWillHear } = await import(pathToFileURL(join(out, 'tp.mjs')));

  check('a place', placeOf('7.81,51.68'), [7.81, 51.68]);
  check('spaces', placeOf(' 7.81 , 51.68 '), [7.81, 51.68]);
  check('the first of two', placeOf(['7.81,51.68', '1,1']), [7.81, 51.68]);
  check('nothing', placeOf(undefined), null);
  check('empty', placeOf(''), null);
  check('one number', placeOf('7.81'), null);
  check('three numbers', placeOf('7.81,51.68,3'), null);
  check('words', placeOf('east,51.68'), null);
  check('half empty', placeOf('7.81,'), null);
  check('past the pole', placeOf('7.81,95'), null);
  check('past the date line', placeOf('190,51'), null);
  check('infinite', placeOf('Infinity,51'), null);

  const box = [[7, 51], [7.01, 51.01]];
  check('no place: the box', boxWith(box, null), box);
  check('no box: the place', boxWith(null, [7, 51]), [[7, 51], [7, 51]]);
  check('inside: the same box', boxWith(box, [7.005, 51.005]), box);
  check('outside: widened', boxWith(box, [7.02, 50.99]), [[7, 50.99], [7.02, 51.01]]);

  check('ru: five digits', groupDigits(12161, 'ru'), '12\u00a0161');
  check('ru: four digits together', groupDigits(1161, 'ru'), '1161');
  check('ru: seven digits', groupDigits(1234567, 'ru'), '1\u00a0234\u00a0567');
  check('de', groupDigits(12161, 'de'), '12.161');
  check('de: four digits together', groupDigits(1161, 'de-DE'), '1161');
  check('en', groupDigits(1161, 'en'), '1,161');
  check('small', groupDigits(942, 'ru'), '942');
  check('zero', groupDigits(0, 'en'), '0');

  // The holder hears of a border he would notice (the server's rule).
  const r = (o) => ({ held: true, leaving: 0, gaining: 0, houses: null, ...o });
  check('not held', holderWillHear(r({ held: false, leaving: 30 })), false);
  check('a few metres', holderWillHear(r({})), false);
  check('a per cent leaves', holderWillHear(r({ leaving: 1 })), true);
  check('a per cent comes', holderWillHear(r({ gaining: 1 })), true);
  check('one house leaves', holderWillHear(r({ houses: { leaving: 1, coming: 0 } })), true);
  check('one house comes', holderWillHear(r({ houses: { leaving: 0, coming: 1 } })), true);
  check('houses counted, none moved', holderWillHear(r({ houses: { leaving: 0, coming: 0 } })), false);

  // Every key the checks window uses, in every language.
  const comp = readFileSync(join(ROOT, 'components', 'territories', 'TerritoryChecks.tsx'), 'utf8');
  // Every key named in the file, also inside a choice (cond ? 'a' : 'b');
  // counted when it is called with a count.
  const counted = new Set(
    [...comp.matchAll(/t\('(territories\.checks\.[A-Za-z]+)', *\{[^}]*count/g)].map((m) => m[1]),
  );
  const keys = [...new Set([...comp.matchAll(/'(territories\.checks\.[A-Za-z]+)'/g)].map((m) => m[1]))].map(
    (k) => [k, counted.has(k)],
  );
  check('the window uses keys', keys.length > 10, true);
  const forms = { ru: ['one', 'few', 'many', 'other'], de: ['one', 'other'], en: ['one', 'other'] };
  for (const lang of ['ru', 'de', 'en']) {
    const loc = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
    const checks = loc.territories?.checks ?? {};
    const missing = [];
    for (const [key, counted] of keys) {
      const leaf = key.split('.').pop();
      if (counted && !(leaf in checks)) {
        for (const f of forms[lang]) if (typeof checks[`${leaf}_${f}`] !== 'string') missing.push(`${leaf}_${f}`);
      } else if (!counted && typeof checks[leaf] !== 'string') missing.push(leaf);
    }
    check(`${lang}: every key of the window`, missing, []);
    // A text that shows {{n}} must be given n where it is called.
    const unfed = [];
    for (const [key] of keys) {
      const leaf = key.split('.').pop();
      const texts = Object.entries(checks)
        .filter(([k]) => k === leaf || k.startsWith(`${leaf}_`))
        .map(([, v]) => v);
      if (!texts.some((v) => v.includes('{{n}}'))) continue;
      const at = comp.indexOf(`'${key}'`);
      if (!/\bn: /.test(comp.slice(at, at + 220))) unfed.push(leaf);
    }
    check(`${lang}: {{n}} is always given`, unfed, []);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ territory checks: ${passed} passed`);
