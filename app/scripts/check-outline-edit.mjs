/**
 * Drawing a boundary again (lib/outline-edit.ts, 12 November 2026): a shared
 * border follows in the neighbour — a corner dragged, a corner added on the
 * shared side, a corner taken away — and nothing else of the neighbour
 * moves; corners and streets attract; houses are counted once.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');

const out = mkdtempSync(join(ROOT, '.check-outline-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'outline-edit.ts'), 'utf8');
  writeFileSync(
    join(out, 'oe.mjs'),
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  const O = await import(pathToFileURL(join(out, 'oe.mjs')));

  // Two neighbours sharing the side x = 7.01.
  const A = [[7, 51], [7.01, 51], [7.01, 51.01], [7, 51.01], [7, 51]];
  const B = [[7.01, 51], [7.02, 51], [7.02, 51.01], [7.01, 51.01], [7.01, 51]];

  // A corner of the shared side dragged east: B's same corner follows.
  const dragged = A.map((p, i) => (i === 1 ? [7.012, 51] : p));
  check('dragged shared corner follows', O.followShared(A, dragged, B), [
    [7.012, 51], [7.02, 51], [7.02, 51.01], [7.01, 51.01], [7.012, 51],
  ]);
  // A corner nobody shares: the neighbour stays.
  const own = A.map((p, i) => (i === 3 ? [6.999, 51.011] : p));
  check('own corner: neighbour untouched', O.followShared(A, own, B), null);

  // A corner added in the middle of the shared side: B gets it on the same side.
  const added = [A[0], A[1], [7.01, 51.005], A[2], A[3], A[4]];
  check('corner added on the shared side', O.followShared(A, added, B), [
    [7.01, 51], [7.02, 51], [7.02, 51.01], [7.01, 51.01], [7.01, 51.005], [7.01, 51],
  ]);
  // …and on its own side only, B stays.
  const addedOwn = [A[0], A[1], A[2], [7.005, 51.01], A[3], A[4]];
  check('corner added on an own side', O.followShared(A, addedOwn, B), null);

  // A shared corner taken away (both have a fifth one on the side).
  const A5 = [A[0], A[1], [7.01, 51.005], A[2], A[3], A[4]];
  const B5 = [B[0], B[1], B[2], B[3], [7.01, 51.005], B[4]];
  const A4 = [A[0], A[1], A[2], A[3], A[4]];
  check('shared corner taken away', O.followShared(A5, A4, B5), B);
  // A triangle neighbour keeps its three corners.
  const tri = [[7.01, 51], [7.02, 51], [7.01, 51.005], [7.01, 51]];
  check('neighbour keeps a shape', O.followShared(A5, A4, tri), null);

  // Corners within a metre are shared; two metres apart are not.
  const offset = (p, m) => [p[0] + m / (111320 * Math.cos((51 * Math.PI) / 180)), p[1]];
  const Bnear = B.map((p, i) => (i === 0 || i === 4 ? offset(p, 0.6) : p));
  check('within a metre counts as shared', O.followShared(A, dragged, Bnear)?.[0], [7.012, 51]);
  const Bfar = B.map((p, i) => (i === 0 || i === 4 ? offset(p, 2) : p));
  check('two metres apart is not shared', O.followShared(A, dragged, Bfar), null);

  // Attraction: a street within the limit, a corner within the limit.
  const street = [[[7, 51.0001], [7.02, 51.0001]]];
  const s = O.snapToLines([7.005, 51.00012], street, 12);
  check('snaps onto the street', s && O.round6(s), [7.005, 51.0001]);
  check('too far from the street', O.snapToLines([7.005, 51.001], street, 12), null);
  check('snaps to a corner', O.snapToCorners([7.01001, 51], [[7.01, 51], [7.02, 51]], 5), [7.01, 51]);

  // Houses changing territory, each counted once.
  const before = { type: 'Polygon', coordinates: [A] };
  const after = { type: 'Polygon', coordinates: [dragged] };
  const houses = O.distinctHouses([
    [7.0105, 51.0002],
    [7.01051, 51.00021],
    [7.005, 51.005],
    [7.015, 51.005],
  ]);
  check('one house per place', houses.length, 3);
  check('houses moving', O.housesMoving(before, after, houses), { leaving: 0, coming: 1 });
  check('houses moving back', O.housesMoving(after, before, houses), { leaving: 1, coming: 0 });
  check('a building middle', O.middleOfRing([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]), [1, 1]);

  // Area: a square of 0.01° at 51° is about 700 × 1105 m; the change is exact.
  const sq = { type: 'Polygon', coordinates: [A] };
  const a = O.areaOf(sq);
  check('area of a square', Math.round(a / 1000), Math.round((0.01 * 111320 * Math.cos((51 * Math.PI) / 180)) * (0.01 * 110540) / 1000));
  check('one corner 0.002° out: a tenth more', Math.round(O.areaChange(sq, after) * 10) / 10, 10);
  check('a hole is not ground', Math.round(O.areaOf({ type: 'Polygon', coordinates: [A, [[7.002, 51.002], [7.004, 51.002], [7.004, 51.004], [7.002, 51.004], [7.002, 51.002]]] }) / a * 100), 96);

  // The changed part: the moved corner with its two neighbours on the ring.
  check('changed box of one dragged corner', O.changedBox(A, dragged), [[7, 51], [7.012, 51.01]]);
  const nudged = A.map((p, i) => (i === 2 ? [7.0105, 51.0105] : p));
  check('changed box is local', O.changedBox(A, nudged), [[7, 51], [7.0105, 51.0105]]);
  const big = [[7, 51], [7.01, 51], [7.02, 51], [7.03, 51], [7.03, 51.01], [7, 51.01], [7, 51]];
  const bigMoved = big.map((p, i) => (i === 2 ? [7.02, 50.999] : p));
  check('changed box leaves the far corners out', O.changedBox(big, bigMoved), [[7.01, 50.999], [7.03, 51]]);
  check('nothing changed, no box', O.changedBox(A, A), null);

  // What goes to the server: six decimals, unchanged when nothing moved.
  check(
    'six decimals',
    O.roundGeometry({ type: 'Polygon', coordinates: [[[7.1234567, 51.7654321]]] }).coordinates,
    [[[7.123457, 51.765432]]],
  );
  check(
    'a hair is no change',
    O.sameGeometry(before, { type: 'Polygon', coordinates: [A.map((p) => [p[0] + 1e-8, p[1]])] }),
    true,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failures) {
  console.error(`check-outline-edit: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`check-outline-edit: ${passed} checks passed`);
