/**
 * Dividing a territory between groups (lib/territory-split.ts, 12 November
 * 2026): houses go to their nearest street, sheds are not houses, and the
 * parts come out even and side by side.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-split-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'territory-split.ts'), 'utf8');
  writeFileSync(
    join(out, 'split.mjs'),
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  const S = await import(pathToFileURL(join(out, 'split.mjs')));

  // Two parallel streets 100 m apart at 51° N (0.0009° north ≈ 100 m).
  const A = { name: 'Ahornweg', lines: [[[7.0, 51.0], [7.003, 51.0]]] };
  const B = { name: 'Birkenweg', lines: [[[7.0, 51.0009], [7.003, 51.0009]]] };
  const houses = [
    [7.001, 51.0001], [7.002, 51.0001], // next to Ahornweg
    [7.001, 51.0008], // next to Birkenweg
    [7.001, 51.01], // a kilometre off: a barn, nobody's
  ];
  const st = S.streetsWithHouses([A, B, { name: '', lines: [[[7, 51], [7.1, 51]]] }], houses);
  check('houses to the nearest street; nameless roads and far barns left out',
    st.map((s) => [s.name, s.houses]), [['Ahornweg', 2], ['Birkenweg', 1]]);
  check('one street drawn in pieces is one street',
    S.streetsWithHouses([A, { ...A, lines: [[[7.003, 51.0], [7.006, 51.0]]] }], [[7.005, 51.0001]]).map((s) => [s.name, s.houses]),
    [['Ahornweg', 1]]);

  // A 10 m × 10 m square: 100 m².
  const sq = [[7, 51], [7 + 10 / (111320 * Math.cos((51 * Math.PI) / 180)), 51], [7 + 10 / (111320 * Math.cos((51 * Math.PI) / 180)), 51 + 10 / 110540], [7, 51 + 10 / 110540], [7, 51]];
  check('area of a 10 m square', Math.round(S.areaM2(sq)), 100);
  check('a shed is below the house size', S.areaM2(sq) / 4 < S.HOUSE_MIN_M2, true);

  // Eight streets in a row west to east, 10 houses each: four parts of 20, side by side.
  const row = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, houses: 10, at: [7 + i * 0.002, 51] }));
  const four = S.splitStreets(row, 4);
  check('even parts', four.map((p) => p.houses), [20, 20, 20, 20]);
  check('neighbours stay together', four.map((p) => p.streets), [['S0', 'S1'], ['S2', 'S3'], ['S4', 'S5'], ['S6', 'S7']]);
  // One heavy street: the even-out step pulls a neighbour across instead of leaving 30/10.
  const uneven = [
    { name: 'Lang', houses: 20, at: [7.0, 51] },
    { name: 'K1', houses: 10, at: [7.001, 51] },
    { name: 'K2', houses: 5, at: [7.002, 51] },
    { name: 'K3', houses: 5, at: [7.003, 51] },
  ];
  const two = S.splitStreets(uneven, 2);
  check('the even-out step: 20 / 20, not 30 / 10', two.map((p) => p.houses).sort(), [20, 20]);
  check('unevenness of 20/20', S.unevenness(two), 1);
  // A real town territory (houses per street and where they are, from the
  // map; names left out): two long streets of 125–140 buildings. Cutting
  // along one side alone gave 260/202/142; the even-out step must do better.
  const town = [[30, 7.8241, 51.71028], [140, 7.81966, 51.70763], [9, 7.82634, 51.70753], [3, 7.82729, 51.70696], [10, 7.82453, 51.70795], [10, 7.82571, 51.70847], [125, 7.8175, 51.70843], [11, 7.82307, 51.70987], [24, 7.82157, 51.71046], [51, 7.81268, 51.70678], [19, 7.81163, 51.70823], [31, 7.81936, 51.71007], [6, 7.81148, 51.71222], [46, 7.81621, 51.71024], [13, 7.81754, 51.70898], [18, 7.81762, 51.70964], [4, 7.81745, 51.71011], [8, 7.81991, 51.70942], [8, 7.81996, 51.70995], [29, 7.82109, 51.70948], [9, 7.81569, 51.7123]].map(([h, x, y], i) => ({ name: 'T' + i, houses: h, at: [x, y] }));
  const three = S.splitStreets(town, 3);
  check('a real territory in three: within a third of each other', S.unevenness(three) < 1.3, true);
  check('nothing lost on the way', three.reduce((a, p) => a + p.houses, 0), town.reduce((a, s) => a + s.houses, 0));
  check('one part asked for: everything in it', S.splitStreets(row, 1).map((p) => p.houses), [80]);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures > 0) {
  console.error(`\n✗ Territory split: ${failures} of ${failures + passed} checks failed.`);
  process.exit(1);
}
console.log(`OK: territory split (${passed} checks).`);
