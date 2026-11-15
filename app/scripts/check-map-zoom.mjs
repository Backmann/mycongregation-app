/**
 * A zoom curve in a map style must be the WHOLE expression of a property
 * (15 November 2026): MapLibre refuses ['zoom'] anywhere but as the input
 * of a top-level 'interpolate' or 'step' — the layer is not added, the
 * error stops the map's set-up, and every later layer is missing too
 * («Вы здесь», the houses of a division). Nothing in the gate draws a map,
 * so the shape is checked here, in the source.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(n) && !p.includes(`scripts${'/'}check-map-zoom`)) files.push(p);
  }
};
for (const d of ['components', 'lib', 'app']) walk(join(ROOT, d));

/** The text of the bracket expression opening at `i` (s[i] === '['). */
function bracket(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '[') depth++;
    else if (s[j] === ']') {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return s.slice(i);
}

let bad = 0;
let seen = 0;
export function problems(src) {
  const out = [];
  // Each style property whose value is an expression: 'circle-radius': [ … ]
  const re = /'([a-z]+(?:-[a-z]+)+)'\s*:\s*\[/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length - 1;
    const expr = bracket(src, start);
    if (!/\[\s*'zoom'\s*\]/.test(expr)) continue;
    // The whole expression must be ['interpolate', …, ['zoom'], …] or
    // ['step', ['zoom'], …], and ['zoom'] must appear only there.
    const head = /^\[\s*'(interpolate|step)'/.exec(expr);
    const zooms = expr.match(/\[\s*'zoom'\s*\]/g).length;
    const inner = expr.slice(1);
    const topZoom =
      head?.[1] === 'interpolate'
        ? /^\s*'interpolate'\s*,\s*\[[^\]]*\]\s*,\s*\[\s*'zoom'\s*\]/.test(inner)
        : head?.[1] === 'step'
          ? /^\s*'step'\s*,\s*\[\s*'zoom'\s*\]/.test(inner)
          : false;
    if (!topZoom || zooms !== 1) out.push({ prop: m[1], at: m.index });
  }
  return out;
}

// The check checks itself: the shape that broke the map, and the right one.
const wrong = `'circle-radius': ['*', ['case', ['get', 'x'], 2, 1], ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 5]],`;
const right = `'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, ['case', ['get', 'x'], 4, 2], 17, 5],`;
const stepRight = `'line-width': ['step', ['zoom'], 1, 15, 2],`;
if (problems(wrong).length !== 1 || problems(right).length !== 0 || problems(stepRight).length !== 0) {
  console.error('✗ check-map-zoom: the check itself is wrong');
  process.exit(1);
}

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes("'zoom'")) continue;
  seen++;
  for (const p of problems(src)) {
    bad++;
    const line = src.slice(0, p.at).split('\n').length;
    console.error(`✗ ${relative(ROOT, f)}:${line} '${p.prop}': a zoom curve must be the whole expression (top-level 'interpolate' or 'step' on ['zoom'])`);
  }
}
if (bad) {
  console.error(`✗ map zoom: ${bad} problem(s)`);
  process.exit(1);
}
console.log(`✓ map zoom: ${seen} file(s) with zoom curves, all at the top`);
