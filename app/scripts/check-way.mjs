/**
 * The way on a part of a divided territory (lib/way.ts, 14 November 2026):
 * which street is now, how far and which way to it, where the phone points.
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
const out = mkdtempSync(join(ROOT, '.check-way-'));
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
try {
  const src = readFileSync(join(ROOT, 'lib', 'way.ts'), 'utf8');
  writeFileSync(
    join(out, 'way.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const W = await import(pathToFileURL(join(out, 'way.mjs')));
  const P = [7.8, 51.7];
  // 0.001° of latitude ≈ 111 m; 0.001° of longitude here ≈ 69 m.
  check('a hundred-odd metres north', near(W.metres(P, [7.8, 51.701]), 111.2, 1), true);
  check('north is 0', Math.round(W.bearing(P, [7.8, 51.71])), 0);
  check('east is 90', Math.round(W.bearing(P, [7.81, 51.7])), 90);
  check('south-west is about 225', near(W.bearing(P, [7.79, 51.6938]), 225, 2), true);

  const street = [[[7.799, 51.701], [7.801, 51.701]]];
  const n = W.nearestOn(P, street);
  check('the nearest point of a street, square across', [n.at[0].toFixed(4), n.at[1].toFixed(4)], ['7.8000', '51.7010']);
  check('… and how far', near(n.m, 111.2, 1), true);
  check('past the end: the end itself', W.nearestOn([7.81, 51.701], street).at, [7.801, 51.701]);

  const s = (key, lines, walkedAt = null) => ({ key, lines, walkedAt });
  const a = s('a', [[[7.8, 51.7], [7.802, 51.7]]]);
  const b = s('b', [[[7.8, 51.703], [7.802, 51.703]]]);
  const c = s('c', [[[7.8, 51.706], [7.802, 51.706]]]);
  check('now: the first street not walked', W.streetNow([a, b, c], null).key, 'a');
  check('walked ones are passed', W.streetNow([{ ...a, walkedAt: 'x' }, b, c], null).key, 'b');
  check('all walked: none', W.streetNow([{ ...a, walkedAt: 'x' }], null), null);
  check('standing on another street, far from the first: that one', W.streetNow([a, b, c], [7.801, 51.70601]).key, 'c');
  check('close to the first still: the first', W.streetNow([a, b, c], [7.801, 51.7003]).key, 'a');
  check('between streets, on none: the first', W.streetNow([a, b, c], [7.801, 51.7045]).key, 'a');
  const b2 = s('b2', [[[7.8, 51.7004], [7.802, 51.7004]]]);
  check('near the first and near another: still the first', W.streetNow([a, b2, c], [7.801, 51.7002]).key, 'a');
  check('never a walked street, however close', W.streetNow([a, b, { ...c, walkedAt: 'x' }], [7.801, 51.706]).key, 'a');

  const w = W.wayTo(P, street);
  check('the way: north, about 110 m', [Math.round(w.bearing), Math.round(w.m / 10) * 10], [0, 110]);
  check('no lines, no way', W.wayTo(P, []), null);

  check('metres said round', [W.roundDistance(87), W.roundDistance(3), W.roundDistance(994)],
    [{ unit: 'm', n: 90 }, { unit: 'm', n: 10 }, { unit: 'm', n: 990 }]);
  check('kilometres in tenths', [W.roundDistance(1234), W.roundDistance(2000)], [{ unit: 'km', n: 1.2 }, { unit: 'km', n: 2 }]);

  // What the map shows first (14 November 2026): today's streets and the roads
  // between them, not the way there from the start.
  const fs = (x, link) => ({ lines: [[[x, 51.7], [x, 51.701]]], link });
  const four = [fs(7.9, [[7.8, 51.7], [7.9, 51.7]]), fs(7.901, [[7.9, 51.701], [7.901, 51.7]]), fs(7.95), fs(7.96)];
  const f2 = W.frameOf(four, 2, [7.8, 51.7]);
  check('framed today: no start, no first road, no later street', [f2.some((p) => p[0] < 7.9), f2.some((p) => p[0] > 7.901)], [false, false]);
  check('… but the road between today\'s streets', f2.length, 6);
  check('no today: the start and the whole part', W.frameOf(four, null, [7.8, 51.7]).length, 9);
  check('a box round points', W.boxAround([[7.8, 51.7], [7.9, 51.6], [7.85, 51.75]]), [[7.8, 51.6], [7.9, 51.75]]);
  check('no points, no box', W.boxAround([]), null);

  check('Safari\'s compass first', W.headingOf({ webkitCompassHeading: 30, alpha: 10, absolute: true }), 30);
  check('an absolute alpha turns the other way', W.headingOf({ alpha: 90, absolute: true }), 270);
  check('alpha without north: no heading', W.headingOf({ alpha: 90, absolute: false }), null);
  check('a phone held sideways', W.headingOf({ webkitCompassHeading: 300 }, 90), 30);
  check('calmed the short way round', Math.round(W.easeAngle(350, 10, 0.5)), 0);
  check('the first reading as it is', W.easeAngle(null, 123), 123);

  // Today's walk (14 November 2026): the road to each street and the street.
  const st = (y, walkedAt = null) => ({ lines: [[[7.8, y], [7.8, y + 0.001]]], link: [[7.8, y - 0.001], [7.8, y]], walkedAt });
  const three = [st(51.7), st(51.71), st(51.72, 'x')];
  check('the walk of the first two: two streets and the road between, not the way there', Math.round(W.walkOf(three, 2) / 10) * 10, 330);
  check('a street without its road: only the street', Math.round(W.walkOf([{ lines: st(51.7).lines }], 1)), 111);
  check('what is left of today: walked streets drop out', Math.round(W.walkOf(three, 3, true) / 10) * 10, 330);
  check('lines measured', Math.round(W.lineMetres([[[7.8, 51.7], [7.8, 51.701]]])), 111);

  // On the road to a street: how far off, and how much is left along it.
  const road = [[7.8, 51.7], [7.8, 51.702], [7.803, 51.702]];
  const on = W.alongLink([7.8, 51.701], road);
  check('on the road, halfway up: about 110 m up, 210 m along', [Math.round(on.off), Math.round(on.left / 10) * 10], [0, 320]);
  const beside = W.alongLink([7.8005, 51.7021], road);
  check('beside the road round the corner: off by a little, the rest of the corner', [Math.round(beside.off), Math.round(beside.left / 10) * 10], [11, 170]);
  check('no road: nothing', W.alongLink(P, [P]), null);
  const target = { lines: [[[7.803, 51.702], [7.804, 51.702]]], link: road };
  const g1 = W.goOn([7.8, 51.701], target);
  check('on the road: follow it, no dashed line, the metres along it', [g1.via, g1.guide, Math.round(g1.m / 10) * 10, Math.round(g1.bearing)], ['road', null, 320, 0]);
  const g2 = W.goOn([7.7985, 51.701], target);
  check('off to the side: a dashed line to the road', [g2.via, Math.round(g2.bearing)], ['toRoad', 90]);
  const g3 = W.goOn([7.8034, 51.7021], target);
  check('at the street: no road, no line', [g3.via, g3.guide], ['street', null]);
  check('a street without a road: straight to it', W.goOn([7.8, 51.701], { lines: target.lines }).via, 'street');

  const ring = W.circle(P, 20);
  check('a circle closes', ring[0], ring[ring.length - 1]);
  check('… at its radius', near(W.metres(P, ring[8]), 20, 0.5), true);
  const bm = W.beam(P, 90, 45, 50);
  check('a beam starts and ends where one stands', [bm[0], bm[bm.length - 1]], [P, P]);
  check('… and points the way', near(W.bearing(P, bm[6]), 90, 1), true);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`✗ way: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ way: ${passed} passed`);
