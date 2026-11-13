/**
 * A business territory's list as shown (lib/business-view.ts, 13 November
 * 2026): shops in one building are one row, nothing shows twice, the order
 * of the walk is kept; and every word the list uses exists in ru, de, en.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-bview-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'business-view.ts'), 'utf8');
  writeFileSync(
    join(out, 'bv.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { rowsOf, progressOf } = await import(pathToFileURL(join(out, 'bv.mjs')));
  const at = (id, lon, lat) => ({ id, lon, lat });
  const ids = (rows) => rows.map((r) => (Array.isArray(r) ? r.map((x) => x.id) : r.id));

  // A street: a shop, a mall of three (10 m apart), a shop 200 m on.
  const street = [at('a', 7.0, 51), at('m1', 7.002, 51), at('m2', 7.00213, 51), at('m3', 7.00226, 51), at('b', 7.005, 51)];
  check('a mall is one row, in its place', ids(rowsOf(street)), ['a', ['m1', 'm2', 'm3'], 'b']);
  // Members found late still join the row that stands first.
  const late = [at('m1', 7.002, 51), at('a', 7.0, 51), at('m2', 7.00213, 51)];
  check('a member later in the walk joins the row', ids(rowsOf(late)), [['m1', 'm2'], 'a']);
  // A chain: each close to the next, the ends 50 m apart: one building row.
  const chain = [at('c1', 7.0, 51), at('c2', 7.00035, 51), at('c3', 7.0007, 51)];
  check('a chain of neighbours is one row', ids(rowsOf(chain)), [['c1', 'c2', 'c3']]);
  // Apart: 40 m is two rows.
  check('forty metres apart: two rows', ids(rowsOf([at('x', 7.0, 51), at('y', 7.00058, 51)])), ['x', 'y']);
  // Without a point: alone, even next to each other in the list.
  check('no point: alone', ids(rowsOf([at('p', null, null), at('q', null, null)])), ['p', 'q']);
  // Nothing twice, nothing lost.
  const flat = rowsOf(street).flatMap((r) => (Array.isArray(r) ? r : [r])).map((r) => r.id);
  check('everyone once', flat.sort(), street.map((s) => s.id).sort());
  check('empty', rowsOf([]), []);

  check(
    'progress',
    progressOf([{ visit: { state: 'visited' } }, { visit: { state: 'later' } }, { visit: null }, { visit: { state: 'visited' } }]),
    { visited: 2, later: 1, total: 4 },
  );

  // Every key the list and its sheets use, in every language.
  const files = ['components/territories/BusinessList.tsx'];
  const used = new Set();
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/'(territories\.business\.[A-Za-z.]+)'/g)) used.add(m[1]);
  }
  check('the list uses its words', used.size > 15, true);
  const forms = { ru: ['one', 'few', 'many', 'other'], de: ['one', 'other'], en: ['one', 'other'] };
  const lookup = (obj, key) => key.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
  for (const lang of ['ru', 'de', 'en']) {
    const loc = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
    const missing = [];
    for (const key of used) {
      if (key.endsWith('.')) continue;
      const v = lookup(loc, key);
      if (typeof v === 'string' || (v && typeof v === 'object')) continue;
      const parent = lookup(loc, key.split('.').slice(0, -1).join('.')) ?? {};
      const leaf = key.split('.').pop();
      if (forms[lang].every((f) => typeof parent[`${leaf}_${f}`] === 'string')) continue;
      missing.push(key);
    }
    check(`${lang}: every word of the list`, missing, []);
    // Every group has a name, every kind label a group to fall back on.
    const b = loc.territories?.business ?? {};
    check(`${lang}: the six groups`, ['shop', 'food', 'service', 'health', 'lodging', 'other'].filter((g) => typeof b.group?.[g] !== 'string'), []);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ business list: ${passed} passed`);
