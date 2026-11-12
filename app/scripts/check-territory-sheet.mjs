/**
 * The printed territory map (lib/territory-sheet.ts, 12 November 2026):
 * which way the sheet turns, the map's size in print dots, and which street
 * names lie inside the territory (holes respected).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-sheet-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'territory-sheet.ts'), 'utf8');
  writeFileSync(
    join(out, 'sheet.mjs'),
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  const S = await import(pathToFileURL(join(out, 'sheet.mjs')));

  // At 51° north a degree east is about 0.63 of a degree north.
  check('wide on the map: on its side', S.landscapeFor([[7.0, 51.0], [7.03, 51.01]]), true);
  check(
    'equal degrees are taller than wide at 51°: upright',
    S.landscapeFor([[7.0, 51.0], [7.01, 51.01]]),
    false,
  );
  const a4 = S.mapFrame('a4', true);
  check('A4 on its side: the page', [a4.pageW, a4.pageH], [297, 210]);
  check('A4 on its side: the map in mm', [a4.wMm, a4.hMm], [277, 136]);
  check('the map in print dots (220 dpi)', [a4.wPx, a4.hPx], [2399, 1178]);
  const s12 = S.mapFrame('s12', true);
  check('S-12 on its side is the old card', [s12.pageW, s12.pageH], [146, 94]);

  const square = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  };
  check('inside', S.pointInShape(2, 2, square), true);
  check('in the hole is outside', S.pointInShape(5, 5, square), false);
  check('outside', S.pointInShape(12, 2, square), false);
  check(
    'streets inside, each once, sorted; nameless and outside left out',
    S.streetsInside(
      [
        { name: 'Lindenweg', lines: [[[1, 1], [2, 2]]] },
        { name: 'Bahnhofstraße', lines: [[[-5, 5], [1, 5]]] },
        { name: 'Lindenweg', lines: [[[3, 3], [3, 4]]] },
        { name: 'Feldweg', lines: [[[20, 20], [30, 30]]] },
        { name: 'Hofgasse', lines: [[[5, 5], [5.5, 5.5]]] },
        { name: '', lines: [[[1, 1], [2, 2]]] },
      ],
      square,
    ),
    ['Bahnhofstraße', 'Lindenweg'],
  );
  // 2 m per pixel, 8.66 px per mm (220 dpi): 17.3 m per mm; a 130 mm map
  // allows 450 m at most, so 200 m, 11.5 mm long.
  check('scale bar: a round length within a fifth', S.scaleBar(2, 220 / 25.4, 130), {
    metres: 200,
    mm: 11.5,
    label: '200 m',
  });
  check('scale bar: kilometres', S.scaleBar(30, 220 / 25.4, 130)?.label, '5 km');
  check('scale bar: no measure, no bar', S.scaleBar(0, 8, 130), null);
  // An L-shaped territory: the middle of its box lies in the missing corner.
  const ell = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]]],
  };
  const ip = S.insidePoint(ell, [[0, 0], [10, 10]]);
  check('route point: inside a bent territory', S.pointInShape(ip.lng, ip.lat, ell), true);
  check('route point: the middle when it is inside', S.insidePoint({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }, [[0, 0], [10, 10]]), { lng: 5, lat: 5 });
  check('route point: not in a hole', S.pointInShape(S.insidePoint(square, [[0, 0], [10, 10]]).lng, S.insidePoint(square, [[0, 0], [10, 10]]).lat, square), true);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures > 0) {
  console.error(`\n✗ Territory map sheet: ${failures} of ${failures + passed} checks failed.`);
  process.exit(1);
}
console.log(`OK: territory map sheet (${passed} checks).`);
