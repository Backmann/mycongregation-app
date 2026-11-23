#!/usr/bin/env node
/**
 * A MAP ANYONE CAN READ (R-67, 23 November 2026): the numbers the choice was
 * made on, held so that a later change of colour or size cannot quietly undo
 * it.
 *   - Pair colours stay apart for normal sight and the three colour
 *     blindnesses (Machado 2009 simulation, CIELAB ΔE), and dark enough on the
 *     map's ground.
 *   - The background's names are dark (WCAG contrast ≥ 7 on their halo),
 *     larger than Protomaps' own, house numbers from zoom 16.5.
 *   - The pairs' own names are at least 16.5 px at street level.
 *   - Every pair's longer street carries its number; links carry none.
 *   - The map cannot be turned by two fingers, the names lie over the lines,
 *     and «Фото» goes through our server.
 * Run directly, never through package.json (that block feeds the Expo
 * fingerprint).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'map-access-'));
const load = async (rel, name) => {
  const js = ts.transpileModule(readFileSync(join(ROOT, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  writeFileSync(join(out, name), js);
  return import(pathToFileURL(join(out, name)));
};

// lib/division.ts imports nothing at run time but types; lib/map-style.ts likewise.
const D = await load('lib/division.ts', 'division.mjs');
const S = await load('lib/map-style.ts', 'map-style.mjs');

// ---- colour arithmetic --------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const CVD = {
  normal: null,
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const lab = ([r, g, b]) => {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const seen = (h, m) => { const c = hex(h).map(lin); return m ? m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) : c; };
const closest = (colours) => {
  let worst = { d: Infinity };
  for (const [kind, m] of Object.entries(CVD)) {
    const L = colours.map((h) => lab(seen(h, m)));
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const d = Math.hypot(...L[i].map((x, k) => x - L[j][k]));
      if (d < worst.d) worst = { d, kind, pair: `${i + 1}-${j + 1}` };
    }
  }
  return worst;
};

let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exit(1); } };
const GROUND = S.CLEAR_COLOURS.earth;

check('pair colours stay apart for every kind of sight (ΔE: 3 pairs ≥ 30, 4 ≥ 25, 6 ≥ 15)', () => {
  for (const [k, min] of [[3, 30], [4, 25], [6, 15]]) {
    const w = closest(D.PART_COLORS.slice(0, k));
    assert.ok(w.d >= min, `${k} pairs: ${w.pair} only ΔE ${w.d.toFixed(1)} for ${w.kind} (need ${min})`);
  }
});

check('pair colours are dark enough on the ground (contrast ≥ 4)', () => {
  D.PART_COLORS.slice(0, 6).forEach((c, i) => {
    const r = contrast(c, GROUND);
    assert.ok(r >= 4, `pair ${i + 1} ${c}: ${r.toFixed(2)}`);
  });
});

// ---- the background, built the way the app builds it --------------------
const ctx = {};
ctx.self = ctx; ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, 'public/map/basemaps-5.7.2.js'), 'utf8'), ctx);
// Out of the vm's realm, so arrays compare as arrays.
const plain = JSON.parse(JSON.stringify(ctx.basemaps.layers('protomaps', ctx.basemaps.namedFlavor('light'), { lang: 'de' })));
const clear = JSON.parse(JSON.stringify(S.clearLayers(ctx.basemaps)));
const byId = (ls, id) => ls.find((l) => l.id === id);
const at = (v, z) => {
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && v[0] === 'interpolate') {
    const stops = []; for (let i = 3; i < v.length; i += 2) stops.push([v[i], v[i + 1]]);
    if (z <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (z <= stops[i][0]) { const [z0, a] = stops[i - 1], [z1, b] = stops[i]; return a + ((b - a) * (z - z0)) / (z1 - z0); }
    return stops[stops.length - 1][1];
  }
  throw new Error('unknown size ' + JSON.stringify(v));
};

check('the same layers as Protomaps, in the same order (data readers see no change)', () => {
  assert.deepEqual(clear.map((l) => l.id), plain.map((l) => l.id));
  for (const id of S.BASE_LABELS) assert.ok(byId(clear, id), `no layer ${id}`);
});

check('names and house numbers are dark on their halo (contrast ≥ 7), larger than before', () => {
  for (const id of S.BASE_LABELS) {
    const l = byId(clear, id), p = byId(plain, id);
    const r = contrast(l.paint['text-color'], l.paint['text-halo-color']);
    assert.ok(r >= 7, `${id}: ${l.paint['text-color']} on ${l.paint['text-halo-color']} = ${r.toFixed(2)}`);
    assert.ok(at(l.layout['text-size'], 17) > at(p.layout['text-size'], 17), `${id} not larger`);
    assert.ok(l.paint['text-halo-width'] >= 2, `${id} halo ${l.paint['text-halo-width']}`);
  }
  assert.ok(byId(clear, 'address_label').minzoom <= 16.5, 'house numbers come too late');
});

check('main roads stand out: wider, and not the colour of a lane', () => {
  const l = byId(clear, 'roads_major'), p = byId(plain, 'roads_major');
  assert.ok(at(l.paint['line-width'], 16) > at(p.paint['line-width'], 16) * 1.2);
  assert.notEqual(S.CLEAR_COLOURS.major.toLowerCase(), S.CLEAR_COLOURS.minor_a.toLowerCase());
});

check('road names leave out the streets the app names itself, and only those', () => {
  const f = S.roadNameFilter('roads_labels_minor', ['Ziethenstraße']);
  assert.deepEqual(f[1], ['in', ['get', 'kind'], ['literal', ['minor_road', 'other', 'path']]]);
  assert.deepEqual(f[2], ['!', ['in', ['coalesce', ['get', 'name'], ''], ['literal', ['Ziethenstraße']]]]);
  assert.deepEqual(S.roadNameFilter('roads_labels_major', []), ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]]);
  // The kinds are Protomaps' own: its filters name the same lists.
  assert.deepEqual(byId(plain, 'roads_labels_minor').filter, ['in', 'kind', 'minor_road', 'other', 'path']);
  assert.deepEqual(byId(plain, 'roads_labels_major').filter, ['in', 'kind', 'highway', 'major_road']);
});

check("the pairs' own names: at least 16.5 px at street level", () => {
  const size = ['interpolate', ['linear'], ['zoom'], ...S.PAIR_NAME_SIZE.flat()];
  assert.ok(at(size, 16) >= 16.5 && at(size, 17) >= 16.5);
});

check("every pair's longer street carries its number; links and short ones none", () => {
  const long = [[7.80, 51.68], [7.8035, 51.68]]; // about 240 m
  const short = [[7.80, 51.68], [7.8005, 51.68]]; // about 35 m
  const b = S.pairBadges([
    { lines: [long], n: 2, color: '#c2410c' },
    { lines: [short], n: 2, color: '#c2410c' },
    { lines: [long], n: 3, color: '#7c3aed', link: true },
    { lines: [long], color: '#7c3aed' },
  ]);
  assert.equal(b.length, 1);
  assert.equal(b[0].n, 2);
  assert.ok(Math.abs(b[0].lon - 7.800875) < 0.0001, `a quarter along, not ${b[0].lon}`);
});

check('the map: no turning, names over the lines, numbers on them, the photograph through our server', () => {
  const src = readFileSync(join(ROOT, 'components/territories/TerritoryMap.tsx'), 'utf8');
  assert.ok(src.includes('touchZoomRotate?.disableRotation()'), 'two fingers still turn the map');
  assert.ok(src.includes('clearLayers(basemaps)'), 'not the readable background');
  const names = src.indexOf("id: 'routes-names'"), line = src.indexOf("id: 'routes-line'"), badges = src.indexOf("id: 'badges-circle'");
  assert.ok(line > 0 && names > line && badges > names, 'names and numbers must be drawn after the lines');
  assert.ok(src.includes("m.moveLayer?.(id, 'routes-names')"), "the background's names stay under the lines");
  assert.equal(S.photoTilesUrl('https://api.mycongregation.org/api/'), 'https://api.mycongregation.org/api/map-photo/{z}/{x}/{y}.jpg');
  assert.ok(!/wms\.nrw\.de/.test(src), 'the phone must not ask the Land directly');
});

console.log(`✓ Карта для всех: ${n} проверок (цвета пар, подписи, номера пар, без поворота, фото через сервер)`);
