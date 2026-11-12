import type { TerritoryGeometry } from './api';

/**
 * The pure parts of drawing a boundary again (12 November 2026), kept apart
 * from the map so a script can check them (scripts/check-outline-edit.mjs).
 *
 * Rings are GeoJSON's: [lon, lat] points, the last repeating the first.
 * Distances are metres on a flat local projection — exact enough over the
 * few hundred metres of a territory.
 */

export type Pt = [number, number];
export type Ring = Pt[];

/** Two corners closer than this are one corner of a shared border. */
export const SHARED_M = 1;

export function metres(a: Pt, b: Pt): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 110540);
}

/** Six decimals, as the server keeps them (about ten centimetres). */
export function round6(p: Pt): Pt {
  return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
}

export function roundGeometry(g: TerritoryGeometry): TerritoryGeometry {
  const ring = (r: number[][]) => r.map((p) => round6([p[0], p[1]]));
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: (g.coordinates as number[][][]).map(ring) }
    : {
        type: 'MultiPolygon',
        coordinates: (g.coordinates as number[][][][]).map((poly) => poly.map(ring)),
      };
}

export function sameGeometry(a: TerritoryGeometry, b: TerritoryGeometry): boolean {
  return JSON.stringify(roundGeometry(a)) === JSON.stringify(roundGeometry(b));
}

const near = (a: Pt, b: Pt) => metres(a, b) < SHARED_M;

/**
 * One territory's outer ring changed (a corner dragged, a corner added on a
 * side, a corner taken away); the same is done to a neighbour's ring where
 * the two share that corner or that side. Returns the neighbour's new ring,
 * or null when it shares nothing that changed.
 */
export function followShared(before: Ring, after: Ring, other: Ring): Ring | null {
  // A corner moved (or several, as one drag of a closing corner moves two).
  if (before.length === after.length) {
    const moved: [Pt, Pt][] = [];
    before.forEach((p, i) => {
      if (metres(p, after[i]) > 0.01) moved.push([p, after[i]]);
    });
    if (moved.length === 0) return null;
    let changed = false;
    const ring = other.map((q) => {
      for (const [from, to] of moved) {
        if (near(q, from)) {
          changed = true;
          return to;
        }
      }
      return q;
    });
    return changed ? ring : null;
  }
  // A corner added in the middle of a side: the neighbour gets it on the same side.
  if (after.length === before.length + 1) {
    const i = firstDifference(before, after);
    if (i <= 0 || i >= after.length - 1) return null;
    const added = after[i];
    const prev = after[i - 1];
    const next = after[i + 1];
    for (let j = 0; j < other.length - 1; j++) {
      const a = other[j];
      const b = other[j + 1];
      if ((near(a, prev) && near(b, next)) || (near(a, next) && near(b, prev))) {
        return [...other.slice(0, j + 1), added, ...other.slice(j + 1)];
      }
    }
    return null;
  }
  // A corner taken away: the neighbour's same corner goes too, while it keeps a shape.
  if (after.length === before.length - 1) {
    const i = firstDifference(after, before);
    const gone = before[i];
    // The closing corner is two points; four points is the least a ring has.
    if (other.length <= 4) return null;
    const j = other.findIndex((q) => near(q, gone));
    if (j < 0) return null;
    if (j === 0 || j === other.length - 1) {
      const inner = other.slice(1, -1);
      return [...inner, inner[0]];
    }
    return [...other.slice(0, j), ...other.slice(j + 1)];
  }
  return null;
}

function firstDifference(shorter: Ring, longer: Ring): number {
  for (let i = 0; i < shorter.length; i++) {
    if (metres(shorter[i], longer[i]) > 0.01) return i;
  }
  return shorter.length;
}

/** The nearest point on any of the lines, if within `limit` metres. */
export function snapToLines(p: Pt, lines: Pt[][], limit: number): Pt | null {
  const k = Math.cos(p[1] * (Math.PI / 180)) * 111320;
  const kl = 110540;
  let best: Pt | null = null;
  let bestD = limit;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const ax = line[i - 1][0] * k;
      const ay = line[i - 1][1] * kl;
      const bx = line[i][0] * k;
      const by = line[i][1] * kl;
      const px = p[0] * k;
      const py = p[1] * kl;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
      const qx = ax + t * dx;
      const qy = ay + t * dy;
      const d = Math.hypot(qx - px, qy - py);
      if (d < bestD) {
        bestD = d;
        best = [qx / k, qy / kl];
      }
    }
  }
  return best;
}

/** The nearest of the corners, if within `limit` metres. */
export function snapToCorners(p: Pt, corners: Pt[], limit: number): Pt | null {
  let best: Pt | null = null;
  let bestD = limit;
  for (const c of corners) {
    const d = metres(p, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function inRing([x, y]: Pt, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inside(p: Pt, g: TerritoryGeometry): boolean {
  const polys =
    g.type === 'Polygon'
      ? [g.coordinates as number[][][]]
      : (g.coordinates as number[][][][]);
  return polys.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

/**
 * The houses that change territory: points (the middles of the buildings on
 * the map) inside the old outline and not the new one, and the other way.
 */
export function housesMoving(
  before: TerritoryGeometry,
  after: TerritoryGeometry,
  houses: Pt[],
): { leaving: number; coming: number } {
  let leaving = 0;
  let coming = 0;
  for (const h of houses) {
    const was = inside(h, before);
    const is = inside(h, after);
    if (was && !is) leaving += 1;
    if (!was && is) coming += 1;
  }
  return { leaving, coming };
}

/** The middle of a building's outline: the mean of its corners. */
export function middleOfRing(ring: number[][]): Pt | null {
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
  if (pts.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/**
 * One house per place: the map hands a building once for every tile it
 * touches. Middles within two metres are one house.
 */
export function distinctHouses(points: Pt[]): Pt[] {
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (const p of points) {
    // A grid of about two metres; a neighbour cell catches a split pair.
    const gx = Math.round(p[0] / 3e-5);
    const gy = Math.round(p[1] / 2e-5);
    let dup = false;
    for (let dx = -1; dx <= 1 && !dup; dx++) {
      for (let dy = -1; dy <= 1 && !dup; dy++) {
        if (seen.has(`${gx + dx}:${gy + dy}`)) dup = true;
      }
    }
    if (dup) continue;
    seen.add(`${gx}:${gy}`);
    out.push(p);
  }
  return out;
}

/** Square metres of an outline (outer rings less holes), by the shoelace rule. */
export function areaOf(g: TerritoryGeometry): number {
  const polys =
    g.type === 'Polygon'
      ? [g.coordinates as number[][][]]
      : (g.coordinates as number[][][][]);
  const ringArea = (r: number[][]) => {
    if (r.length < 3) return 0;
    const lat = r[0][1];
    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const ky = 110540;
    let sum = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      sum += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
    }
    return Math.abs(sum) / 2;
  };
  return polys.reduce(
    (n, [outer, ...holes]) => n + ringArea(outer) - holes.reduce((m, h) => m + ringArea(h), 0),
    0,
  );
}

/** How the area changed, in percent of the old one (exact, unlike the server's grid). */
export function areaChange(before: TerritoryGeometry, after: TerritoryGeometry): number {
  const a = areaOf(before);
  return a === 0 ? 0 : ((areaOf(after) - a) / a) * 100;
}

/**
 * The box round the part of an outline that changed: the corners that are
 * new or gone, with their neighbours on the ring (the ground between them
 * is what changed hands). Null when nothing changed.
 */
export function changedBox(before: Ring, after: Ring): [Pt, Pt] | null {
  const key = (p: Pt) => `${Math.round(p[0] * 1e6)}:${Math.round(p[1] * 1e6)}`;
  const pts: Pt[] = [];
  const collect = (ring: Ring, other: Ring) => {
    const there = new Set(other.map(key));
    const n = ring.length - 1; // the closing corner repeats the first
    for (let i = 0; i < n; i++) {
      if (there.has(key(ring[i]))) continue;
      pts.push(ring[i], ring[(i - 1 + n) % n], ring[(i + 1) % n]);
    }
  };
  collect(after, before);
  collect(before, after);
  if (pts.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [
    [x0, y0],
    [x1, y1],
  ];
}

/** The map's own tiles carry every building only from this zoom on. */
export const HOUSES_FROM_ZOOM = 15;
