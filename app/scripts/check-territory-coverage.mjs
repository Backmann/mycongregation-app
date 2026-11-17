/**
 * Covering the whole territory (lib/territory-coverage.ts, 17 November
 * 2026): the file «not worked for 2 years and longer» always says it is
 * preliminary and never shows a raw key; the whole map holds every number,
 * no names, the boundary, and turns on its side for a wide territory; the
 * number sits inside its block; a boundary file from the branch is read
 * whether bare, a Feature or a FeatureCollection, and a file with no area
 * is refused. Every key the papers use must exist in ru, de and en.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-tcoverage-'));
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
const locales = Object.fromEntries(
  ['ru', 'de', 'en'].map((l) => [l, JSON.parse(readFileSync(join(ROOT, 'locales', `${l}.json`), 'utf8'))]),
);
const lookup = (obj, key) => key.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
const used = new Set();
const tFor = (lang) => (key, opts) => {
  used.add(key);
  let v = lookup(locales[lang], key);
  if (typeof v !== 'string') return `!!${key}`;
  for (const [a, b] of Object.entries(opts ?? {})) v = v.replaceAll(`{{${a}}}`, String(b));
  return v;
};
try {
  const src = readFileSync(join(ROOT, 'lib', 'territory-coverage.ts'), 'utf8');
  writeFileSync(
    join(out, 'tc.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { buildLongUnworkedHtml, labelPoint, buildWholeMapHtml, boundaryFromGeoJson } = await import(
    pathToFileURL(join(out, 'tc.mjs'))
  );
  const date = (iso) => `[${iso}]`;
  const sq = (x, y, s = 1) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];

  // ---- the file for the circuit overseer's visit
  for (const lang of ['ru', 'de', 'en']) {
    const t = tFor(lang);
    const data = {
      today: '2026-11-17',
      recordsFrom: '2026-08-01',
      items: [
        { number: 'Drenst1', locality: 'Drensteinfurt', lastWorkedOn: '2024-09-22', heldSince: '2026-08-08' },
        { number: 'Welver2', locality: null, lastWorkedOn: null, heldSince: null },
        { number: '<b>x</b>', locality: 'A & B', lastWorkedOn: '2024-01-01', heldSince: null },
      ],
    };
    const html = buildLongUnworkedHtml(data, 'Gemeinde', t, date);
    check(`${lang}: no raw keys in the file`, /!!/.test(html), false);
    check(`${lang}: the file says it is preliminary, with the date`,
      html.includes(t('territories.coverage.preliminary', { date: '[2026-08-01]' })), true);
    check(`${lang}: the file has its title`, html.includes(t('territories.coverage.fileTitle')), true);
    check(`${lang}: every territory in the file`, ['Drenst1', 'Welver2'].every((n) => html.includes(`>${n}<`)), true);
    check(`${lang}: names are escaped`, html.includes('<b>x</b>') || html.includes('A & B'), false);
    check(`${lang}: never worked reads as such`, html.includes(t('territories.coverage.never')), true);
    check(`${lang}: held since`, html.includes(t('territories.coverage.heldSince', { date: '[2026-08-08]' })), true);
    const none = buildLongUnworkedHtml({ today: '2026-11-17', recordsFrom: null, items: [] }, 'G', t, date);
    check(`${lang}: empty list says so`, none.includes(t('territories.coverage.noneLong')) && !none.includes('<table'), true);
    check(`${lang}: no start date — still preliminary`, none.includes(t('territories.coverage.preliminaryNoDate')), true);
  }

  // ---- where the number goes
  check('label of a square', labelPoint({ type: 'Polygon', coordinates: sq(0, 0, 2) }), [1, 1]);
  const L = [[[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]]];
  const [lx, ly] = labelPoint({ type: 'Polygon', coordinates: L });
  check('label of an L inside its bounding box', lx > 0 && lx < 4 && ly > 0 && ly < 4, true);
  check('label of a multipolygon goes to the larger part',
    labelPoint({ type: 'MultiPolygon', coordinates: [sq(10, 10, 1), sq(0, 0, 4)] }), [2, 2]);
  check('label of a reversed ring is the same', labelPoint({ type: 'Polygon', coordinates: [sq(0, 0, 2)[0].slice().reverse()] }), [1, 1]);

  // ---- the whole map
  const t = tFor('ru');
  const terrs = [
    { number: 'Hamm1', geometry: { type: 'Polygon', coordinates: sq(7.8, 51.6, 0.01) }, held: true },
    { number: 'Hamm2', geometry: { type: 'Polygon', coordinates: sq(7.81, 51.6, 0.01) }, held: false },
  ];
  const boundary = { type: 'Polygon', coordinates: sq(7.79, 51.59, 0.04) };
  const plain = buildWholeMapHtml(terrs, boundary, { size: 'A4', status: false, title: 'Map' }, t);
  check('map: every number', ['Hamm1', 'Hamm2'].every((n) => plain.includes(`>${n}</text>`)), true);
  check('map: every border', (plain.match(/<path /g) ?? []).length, 3);
  check('map: plain has no shading', plain.includes('#d9d9d9'), false);
  check('map: no raw keys', /!!/.test(plain), false);
  const status = buildWholeMapHtml(terrs, boundary, { size: 'A3', status: true, title: 'Map' }, t);
  check('map: held shaded, free plain', (status.match(/#d9d9d9/g) ?? []).length, 1);
  check('map: legend with status', status.includes(t('territories.wholeMap.legend')), true);
  check('map: A3 page', /@page \{ size: A3/.test(status), true);
  const wide = buildWholeMapHtml(
    [{ number: 'W', geometry: { type: 'Polygon', coordinates: [[[7, 51], [7.3, 51], [7.3, 51.05], [7, 51.05], [7, 51]]] }, held: false }],
    null, { size: 'A4', status: false, title: 'M' }, t,
  );
  check('map: a wide territory turns the sheet on its side', /size: A4 landscape/.test(wide), true);
  const tall = buildWholeMapHtml(
    [{ number: 'T', geometry: { type: 'Polygon', coordinates: [[[7, 51], [7.02, 51], [7.02, 51.3], [7, 51.3], [7, 51]]] }, held: false }],
    null, { size: 'A4', status: false, title: 'M' }, t,
  );
  check('map: a tall territory stays upright', /size: A4 portrait/.test(tall), true);
  // Every coordinate on the sheet: nothing drawn off the page.
  const nums = [...plain.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  check('map: inside the A4 sheet', nums.length > 0 && nums.every(([x, y]) => x >= 0 && y >= 0 && x <= 297 && y <= 297), true);
  check('map: escaped number', buildWholeMapHtml(
    [{ number: '<x>', geometry: terrs[0].geometry, held: false }], null, { size: 'A4', status: false, title: 'M' }, t,
  ).includes('<x>'), false);
  check('map: no territories still draws', /<svg/.test(buildWholeMapHtml([], null, { size: 'A4', status: false, title: 'M' }, t)), true);

  // ---- the boundary file
  const poly = { type: 'Polygon', coordinates: sq(7, 51, 1) };
  check('geojson: bare polygon', boundaryFromGeoJson(JSON.stringify(poly)), poly);
  check('geojson: feature', boundaryFromGeoJson(JSON.stringify({ type: 'Feature', geometry: poly, properties: {} })), poly);
  check('geojson: collection, first area after a point', boundaryFromGeoJson(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [7, 51] } }, { type: 'Feature', geometry: poly }],
  })), poly);
  const multi = { type: 'MultiPolygon', coordinates: [sq(7, 51, 1)] };
  check('geojson: multipolygon', boundaryFromGeoJson(JSON.stringify(multi)), multi);
  check('geojson: no area', boundaryFromGeoJson(JSON.stringify({ type: 'LineString', coordinates: [[7, 51], [8, 52]] })), null);
  check('geojson: not json', boundaryFromGeoJson('<kml/>'), null);

  // ---- a short date already ends with a dot («15 нояб.», «1. Sept.»): a
  // sentence that ends right after one read «с 15 нояб..» (stand, 17 November
  // 2026). No territory string puts a dot straight after a date.
  const DATE_SLOTS = /\{\{(date|on|start|day|since|until|dueOn)\}\}\./;
  for (const lang of ['ru', 'de', 'en']) {
    const walk = (o, k) => {
      if (typeof o === 'string') {
        if (DATE_SLOTS.test(o)) {
          failures += 1;
          console.error(`✗ ${lang} ${k}: a dot right after a date — «${o.slice(0, 80)}»`);
        } else passed += 1;
      } else if (o && typeof o === 'object') for (const [a, b] of Object.entries(o)) walk(b, `${k}.${a}`);
    };
    walk(locales[lang].territories, 'territories');
  }
  check('preliminary with a short date reads with one dot',
    tFor('ru')('territories.coverage.preliminary', { date: '15 нояб.' }).includes('нояб..'), false);

  // ---- every key the papers and screens use
  for (const k of used)
    for (const lang of ['ru', 'de', 'en'])
      if (typeof lookup(locales[lang], k) !== 'string') {
        failures += 1;
        console.error(`✗ key ${k} missing in ${lang}`);
      }
  const screens = ['app/(app)/cart/territory-coverage.tsx', 'app/(app)/cart/territory-boundary.tsx',
    'components/territories/WholeMapButton.tsx', 'app/(app)/cart/my-territories.tsx'];
  for (const f of screens) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/\bt\(\s*'(territories\.[\w.]+)'/g))
      for (const lang of ['ru', 'de', 'en']) {
        const v = lookup(locales[lang], m[1]);
        const plural = v == null && ['one', 'other'].every((p) => typeof lookup(locales[lang], `${m[1]}_${p}`) === 'string');
        if (typeof v !== 'string' && !plural) {
          failures += 1;
          console.error(`✗ ${f}: key ${m[1]} missing in ${lang}`);
        } else passed += 1;
      }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`check-territory-coverage: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`check-territory-coverage: ${passed} passed`);
