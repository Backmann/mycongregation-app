/**
 * Covering the whole territory (17 November 2026; the instruction: «the
 * publishers try to cover all the congregation's territory at least once a
 * year; areas not covered for two years or longer the elders discuss with
 * the circuit overseer»), and the papers that go with it:
 *  - the file «Участки — не обработаны 2 года и дольше (предварительно)»,
 *    a separate file for the circuit overseer's visit;
 *  - the whole map: every territory with its border and number on one sheet
 *    (S-12: «all territories are usually shown on a general map»), drawn as
 *    vectors — the same on the web and on a phone, sharp at any size;
 *  - a boundary file from the branch, KML or GeoJSON, read to a geometry.
 *
 * Pure, for scripts/check-territory-coverage.mjs. The words come through `t`.
 */

type T = (key: string, opts?: Record<string, unknown>) => string;

export type Ring = number[][];
export type Geometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ------------------------------------------------------ two years and longer

export interface LongItem {
  number: string;
  locality: string | null;
  lastWorkedOn: string | null;
  heldSince: string | null;
}

export function buildLongUnworkedHtml(
  data: { today: string; recordsFrom: string | null; items: LongItem[] },
  congregation: string,
  t: T,
  date: (iso: string) => string,
): string {
  const k = (key: string, o?: Record<string, unknown>) => t(`territories.coverage.${key}`, o);
  const rows = data.items
    .map(
      (i) => `<tr><td class="n">${esc(i.number)}</td><td>${esc(i.locality ?? '')}</td><td>${
        i.lastWorkedOn ? esc(date(i.lastWorkedOn)) : esc(k('never'))
      }</td><td>${i.heldSince ? esc(k('heldSince', { date: date(i.heldSince) })) : esc(k('free'))}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(k('fileTitle'))}</title><style>
@page { size: A4; margin: 16mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10.5pt; }
h1 { font-size: 15pt; margin: 0 0 2mm; }
.sub { font-size: 10pt; margin-bottom: 4mm; }
.note { border: 1pt solid #000; padding: 3mm; margin-bottom: 5mm; font-size: 9.5pt; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 0.6pt solid #000; padding: 2mm; text-align: left; vertical-align: top; }
th { font-size: 9pt; }
td.n { font-weight: bold; white-space: nowrap; }
</style></head><body>
<h1>${esc(k('fileTitle'))}</h1>
<div class="sub">${esc(congregation)} · ${esc(k('fileAsOf', { date: date(data.today) }))}</div>
<div class="note">${esc(
    data.recordsFrom
      ? k('preliminary', { date: date(data.recordsFrom) })
      : k('preliminaryNoDate'),
  )}</div>
${
  data.items.length
    ? `<table><thead><tr><th>${esc(k('colNumber'))}</th><th>${esc(k('colPlace'))}</th><th>${esc(
        k('colLast'),
      )}</th><th>${esc(k('colNow'))}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>${esc(k('noneLong'))}</p>`
}
</body></html>`;
}

// ---------------------------------------------------------------- whole map

export interface MapTerritory {
  number: string;
  geometry: Geometry;
  held: boolean;
}

const polysOf = (g: Geometry): Ring[][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/**
 * Where a territory's number goes: the centre of its largest outer ring,
 * by area — a point that is the ring's balance, which for the town's blocks
 * falls inside.
 */
export function labelPoint(g: Geometry): [number, number] {
  let best: { a: number; x: number; y: number } | null = null;
  for (const poly of polysOf(g)) {
    const ring = poly[0];
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (a === 0) continue;
    const c = { a: Math.abs(a / 2), x: cx / (3 * a), y: cy / (3 * a) };
    if (!best || c.a > best.a) best = c;
  }
  if (best) return [best.x, best.y];
  const p = polysOf(g)[0][0][0];
  return [p[0], p[1]];
}

/**
 * The whole map on one sheet: the boundary of the congregation, every
 * territory's border and number; with `status`, free territories plain and
 * held ones shaded — no names, it may hang on a wall.
 */
export function buildWholeMapHtml(
  territories: MapTerritory[],
  boundary: Geometry | null,
  opts: { size: 'A4' | 'A3'; status: boolean; title: string },
  t: T,
): string {
  const all = [...territories.map((x) => x.geometry), ...(boundary ? [boundary] : [])];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of all)
    for (const poly of polysOf(g))
      for (const ring of poly)
        for (const [x, y] of ring) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  // Degrees of longitude shrink with latitude: the map keeps its shape.
  const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const w = (maxX - minX) * kx || 1;
  const h = maxY - minY || 1;
  // The sheet on its side when the territory is wider than tall.
  const landscape = w > h;
  const page = opts.size === 'A3' ? [420, 297] : [297, 210];
  const [pw, ph] = landscape ? page : [page[1], page[0]];
  const margin = 10;
  const head = 12;
  const boxW = pw - 2 * margin;
  const boxH = ph - 2 * margin - head;
  const scale = Math.min(boxW / w, boxH / h);
  const ox = margin + (boxW - w * scale) / 2;
  const oy = margin + head + (boxH - h * scale) / 2;
  const px = (x: number) => (ox + (x - minX) * kx * scale).toFixed(2);
  const py = (y: number) => (oy + (maxY - y) * scale).toFixed(2);
  const path = (g: Geometry) =>
    polysOf(g)
      .map((poly) => poly.map((ring) => `M${ring.map(([x, y]) => `${px(x)},${py(y)}`).join('L')}Z`).join(''))
      .join('');
  const font = opts.size === 'A3' ? 3.2 : 2.4;
  const shapes = territories
    .map(
      (x) =>
        `<path d="${path(x.geometry)}" fill="${opts.status && x.held ? '#d9d9d9' : 'none'}" stroke="#000" stroke-width="0.25" fill-rule="evenodd"/>`,
    )
    .join('');
  const labels = territories
    .map((x) => {
      const [lx, ly] = labelPoint(x.geometry);
      return `<text x="${px(lx)}" y="${py(ly)}" font-size="${font}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" stroke="#fff" stroke-width="0.6" paint-order="stroke">${esc(x.number)}</text>`;
    })
    .join('');
  const edge = boundary
    ? `<path d="${path(boundary)}" fill="none" stroke="#000" stroke-width="0.8" fill-rule="evenodd"/>`
    : '';
  const legend = opts.status ? ` · ${esc(t('territories.wholeMap.legend'))}` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
@page { size: ${opts.size} ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
html, body { margin: 0; padding: 0; }
svg { display: block; width: ${pw}mm; height: ${ph}mm; }
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}" width="${pw}mm" height="${ph}mm">
<text x="${margin}" y="${margin + 5}" font-size="5" font-family="Arial, Helvetica, sans-serif" font-weight="bold">${esc(opts.title)}</text>
<text x="${margin}" y="${margin + 10}" font-size="3" font-family="Arial, Helvetica, sans-serif">${esc(
    t('territories.wholeMap.count', { count: territories.length }),
  )}${legend}</text>
${shapes}${edge}${labels}</svg></body></html>`;
}

// ------------------------------------------------------- the boundary file

/**
 * A GeoJSON boundary from the branch: a Polygon or MultiPolygon, bare or in
 * a Feature or FeatureCollection (the first area found). Null when it holds
 * no area.
 */
export function boundaryFromGeoJson(text: string): Geometry | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const find = (o: unknown): Geometry | null => {
    if (!o || typeof o !== 'object') return null;
    const x = o as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
    if ((x.type === 'Polygon' || x.type === 'MultiPolygon') && Array.isArray(x.coordinates)) {
      return { type: x.type, coordinates: x.coordinates } as Geometry;
    }
    if (x.type === 'Feature') return find(x.geometry);
    if (x.type === 'FeatureCollection' && Array.isArray(x.features)) {
      for (const f of x.features) {
        const g = find(f);
        if (g) return g;
      }
    }
    return null;
  };
  return find(v);
}
