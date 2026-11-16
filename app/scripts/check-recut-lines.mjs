/**
 * The parts of a cut counted on the device (lib/recut-lines.ts, 16 November
 * 2026) against the server's own cut: the fixture holds invented territories,
 * lines and points cut by the server's partsOfCut and placed by its partOf
 * (made by the server's scripts/recut-lines-fixture.cjs). Every point must
 * fall in the same part here; the lines the server refuses must be refused.
 * A homes count on the editor that differs from the saved one would be a
 * number on the screen the save then contradicts.
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
const out = mkdtempSync(join(ROOT, '.check-recut-lines-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'recut-lines.ts'), 'utf8');
  writeFileSync(
    join(out, 'recut-lines.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const r = await import(pathToFileURL(join(out, 'recut-lines.mjs')).href);
  const { cases } = JSON.parse(readFileSync(join(ROOT, 'scripts', 'fixtures', 'recut-lines.json'), 'utf8'));
  let points = 0;
  let refused = 0;
  cases.forEach((c, n) => {
    const cut = r.cutOf(c.g, c.lines);
    if (c.refused) {
      refused += 1;
      check(`case ${n}: the server refuses these lines (${c.refused}) — so does the editor`, cut.problem !== null, true);
      return;
    }
    check(`case ${n}: as many parts as the server`, cut.parts, c.parts);
    const wrong = c.points.filter(([p, want]) => cut.partOf(p) !== want);
    points += c.points.length;
    check(`case ${n}: every point in the server's part`, wrong.slice(0, 3), []);
  });
  check('the fixture has refused lines and points to place', [refused > 0, points > 1000], [true, true]);

  // A square cut by two straight lines, by hand.
  const sq = { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [3, 1], [0, 1], [0, 0]]] };
  const v = (x) => [[x, -1], [x, 2]];
  const cut = r.cutOf(sq, [v(1), v(2)]);
  check('a square in three: the left of each line keeps the place, the rest is added at the end', [0.5, 1.5, 2.5].map((x) => cut.partOf([x, 0.5])), [0, 1, 2]);
  check('outside: -1', cut.partOf([5, 0.5]), -1);
  check('homes by part', r.homesByPart(cut, [[0.5, 0.5], [0.6, 0.5], [2.5, 0.5]]), [2, 0, 1]);
  check('a line off the territory: refused, which line and why', r.cutOf(sq, [v(1), v(9)]).problem, { line: 1, why: 'notThrough' });
  check(
    'a line that crosses itself: refused',
    r.cutOf(sq, [[[1, -1], [1, 2], [0.5, 0.5], [1.5, 0.5]]]).problem?.why,
    'crosses',
  );
  check('no line: refused', r.cutOf(sq, []).problem?.why, 'many');
  // A line's middle carried across another line: it cuts another part.
  const crossed = r.cutOf(sq, [v(1.5), [[2.5, -1], [2.5, 0.2], [0.7, 0.5], [2.5, 0.8], [2.5, 2]]]);
  check('the part each line cuts', r.cutOf(sq, [v(1.5), v(2.5)]).targets, [0, 1]);
  check('a middle carried across the first line: the second cuts the other part', crossed.targets, [0, 0]);
  check('…and the screen names that line', r.retargeted(r.cutOf(sq, [v(1.5), v(2.5)]), crossed), [1]);
  check('a small move: nothing named', r.retargeted(r.cutOf(sq, [v(1.5), v(2.5)]), r.cutOf(sq, [v(1.5), v(2.4)])), []);
  check('another number of lines: nothing named (all is new anyway)', r.retargeted(r.cutOf(sq, [v(1.5)]), crossed), []);
  check('eight lines: too many parts', r.cutOf(sq, Array.from({ length: 8 }, (_, i) => v(0.3 + i * 0.3))).problem?.why, 'many');
  const homes = [[0.5, 0.5], [1.4, 0.5], [1.6, 0.5], [2.5, 0.5]];
  check('moved: one home of four changes part', r.movedShare(cut, r.cutOf(sq, [v(1), v(1.5)]), homes), 0.25);
  check('moved: another number of parts is all', r.movedShare(cut, r.cutOf(sq, [v(1)]), homes), 1);
  // In metres: 0.0001° of longitude at 51° is about 7 m.
  const town = { type: 'Polygon', coordinates: [[[7, 51], [7.01, 51], [7.01, 51.01], [7, 51.01], [7, 51]]] };
  // 7 m and 21 m from the line count; 35 m and a home outside do not.
  const near = [[7.0051, 51.005], [7.0053, 51.005], [7.0055, 51.005], [7.02, 51.005]];
  check('beside a line: within 25 m, inside the territory', r.besideCounts(town, [[[7.005, 50.99], [7.005, 51.02]]], near), [2]);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`check-recut-lines: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ the lines of a cut, counted as the server cuts: ${passed} checks`);
