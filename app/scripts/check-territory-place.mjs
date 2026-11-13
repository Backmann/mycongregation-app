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
  const { placeOf, boxWith } = await import(pathToFileURL(join(out, 'tp.mjs')));

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
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ territory checks: ${passed} passed`);
