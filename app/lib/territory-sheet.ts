/**
 * The printed territory map, a modern S-12 (12 November 2026) — the parts
 * that are plain sums: which way the sheet turns, how large the map is, how
 * many dots it needs, and which street names lie inside the territory.
 *
 * No imports: the gate runs this file on its own
 * (scripts/check-territory-sheet.mjs).
 */

export type SheetFormat = 's12' | 'a5' | 'a4';

/** Paper in millimetres, upright. 'S-12' is the old card, 146 × 94 mm. */
export const PAPER: Record<SheetFormat, { w: number; h: number }> = {
  s12: { w: 94, h: 146 },
  a5: { w: 148, h: 210 },
  a4: { w: 210, h: 297 },
};

/** Margins and the band under the map for its words and the QR code. */
export const LAYOUT: Record<SheetFormat, { margin: number; head: number; foot: number }> = {
  s12: { margin: 5, head: 11, foot: 20 },
  a5: { margin: 8, head: 14, foot: 30 },
  a4: { margin: 10, head: 16, foot: 38 },
};

/** Dots per inch the map is drawn at: sharp street names on paper. */
export const PRINT_DPI = 220;

/**
 * A territory wider than tall goes on a sheet turned on its side, so the
 * map fills the paper either way.
 */
export function landscapeFor(box: [[number, number], [number, number]]): boolean {
  const [[x1, y1], [x2, y2]] = box;
  // A degree of longitude is shorter than one of latitude away from the
  // equator: compare true lengths.
  const midLat = ((y1 + y2) / 2) * (Math.PI / 180);
  const w = Math.abs(x2 - x1) * Math.cos(midLat);
  const h = Math.abs(y2 - y1);
  return w > h;
}

/** The map's frame on the sheet in millimetres and in pixels. */
export function mapFrame(format: SheetFormat, landscape: boolean) {
  const p = PAPER[format];
  const l = LAYOUT[format];
  const pw = landscape ? p.h : p.w;
  const ph = landscape ? p.w : p.h;
  const wMm = pw - 2 * l.margin;
  const hMm = ph - 2 * l.margin - l.head - l.foot;
  const px = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI);
  return { pageW: pw, pageH: ph, wMm, hMm, wPx: px(wMm), hPx: px(hMm) };
}

type Ring = [number, number][];

/** Ray casting: is the point inside the ring? */
function insideRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside a Polygon or MultiPolygon (holes respected). */
export function pointInShape(
  x: number,
  y: number,
  shape: { type: string; coordinates: unknown },
): boolean {
  const polys = (
    shape.type === 'MultiPolygon' ? shape.coordinates : [shape.coordinates]
  ) as Ring[][];
  return polys.some(
    (rings) => insideRing(x, y, rings[0]) && !rings.slice(1).some((h) => insideRing(x, y, h)),
  );
}

/**
 * The street names inside the territory, from the road lines the map holds:
 * a road counts when any of its points lies inside. Sorted, each once.
 */
export function streetsInside(
  roads: { name: string | null | undefined; lines: [number, number][][] }[],
  shape: { type: string; coordinates: unknown },
): string[] {
  const names = new Set<string>();
  for (const r of roads) {
    const name = (r.name ?? '').trim();
    if (!name || names.has(name)) continue;
    if (r.lines.some((line) => line.some(([x, y]) => pointInShape(x, y, shape)))) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * A scale bar for the printed map: a round length (1, 2 or 5 times a power
 * of ten metres) no longer than a fifth of the map's width.
 * `metresPerPx` is measured on the picture; `pxPerMm` from its size on paper.
 */
export function scaleBar(
  metresPerPx: number,
  pxPerMm: number,
  mapWidthMm: number,
): { metres: number; mm: number; label: string } | null {
  if (!(metresPerPx > 0) || !(pxPerMm > 0) || !(mapWidthMm > 0)) return null;
  const metresPerMm = metresPerPx * pxPerMm;
  const most = metresPerMm * mapWidthMm * 0.2;
  let pick = 0;
  for (let p = 1; p <= most * 10; p *= 10) {
    for (const k of [1, 2, 5]) if (k * p <= most) pick = k * p;
  }
  if (!pick) return null;
  const mm = Math.round((pick / metresPerMm) * 10) / 10;
  const label = pick >= 1000 ? `${pick / 1000} km` : `${pick} m`;
  return { metres: pick, mm, label };
}
