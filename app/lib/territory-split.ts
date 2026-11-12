/**
 * Dividing a territory between groups (12 November 2026): its streets, laid
 * out in parts with about the same number of houses each.
 *
 * The map holds no house numbers, so a part is a set of whole streets — or of
 * pieces of a long one, cut where its houses are. Each building inside the
 * territory goes to the nearest named street; a street weighs as many houses
 * as it got. The streets are then cut into parts by
 * halving the territory again and again along its longer side at the
 * weighted middle — parts lie side by side, not mixed.
 *
 * No imports: the gate runs this file on its own (scripts/check-territory-split.mjs).
 */

type Pt = [number, number];

export interface StreetInput {
  name: string;
  lines: Pt[][];
}

export interface Street {
  name: string;
  /** The name as shown: a long street cut in pieces gets «(1/3)» etc., west or south first. */
  label?: string;
  houses: number;
  /** Which of the given houses are its own (their indices). */
  homes?: number[];
  /** Where its houses are, on average (lng, lat); the street's own middle when it has none. */
  at: Pt;
}

export interface Part {
  streets: string[];
  houses: number;
}

/** Metres per degree east at a latitude, and per degree north. */
function scale(lat: number): [number, number] {
  return [111_320 * Math.cos((lat * Math.PI) / 180), 110_540];
}

function segDist2(p: Pt, a: Pt, b: Pt, k: [number, number]): number {
  const ax = a[0] * k[0], ay = a[1] * k[1], bx = b[0] * k[0], by = b[1] * k[1];
  const px = p[0] * k[0], py = p[1] * k[1];
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/**
 * A building smaller than this is a shed, a garage or a garden hut, not a
 * house to call at (12 November 2026: in Hamm44 more than half of the 2002
 * buildings on the map were under 40 m², most of them in allotment gardens).
 */
export const HOUSE_MIN_M2 = 40;

/** The ground a building's outline covers, in square metres. */
export function areaM2(ring: Pt[]): number {
  if (ring.length < 3) return 0;
  const k = scale(ring[0][1]);
  let a = 0;
  for (let i = 1; i < ring.length; i++) {
    a += ring[i - 1][0] * k[0] * (ring[i][1] * k[1]) - ring[i][0] * k[0] * (ring[i - 1][1] * k[1]);
  }
  return Math.abs(a) / 2;
}

/** Road kinds that are not streets one walks to call: railways, ferries, runways. */
export const NOT_STREETS = ['rail', 'ferry', 'aeroway'];

/** A house further than this from every named street is left out (a barn in a field). */
const FAR_M = 150;

/**
 * Each house to its nearest named street. Streets of the same name are one
 * street; a long one comes back in pieces (see PIECE_M). Streets without a
 * house stay, weighing nothing.
 */
export function streetsWithHouses(streets: StreetInput[], houses: Pt[]): Street[] {
  const byName = new Map<string, Pt[][]>();
  for (const s of streets) {
    const name = s.name.trim();
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), ...s.lines]);
  }
  const names = [...byName.keys()];
  const mine: number[][] = names.map(() => []);
  houses.forEach((h, hi) => {
    const k = scale(h[1]);
    let best = -1;
    let bestD = FAR_M * FAR_M;
    names.forEach((name, i) => {
      for (const line of byName.get(name)!) {
        for (let j = 1; j < line.length; j++) {
          const d = segDist2(h, line[j - 1], line[j], k);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    });
    if (best >= 0) mine[best].push(hi);
  });
  return names.flatMap((name, i) => {
    const own = mine[i];
    if (own.length === 0) {
      const pts = byName.get(name)!.flat();
      const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      return [{ name, label: name, houses: 0, at: [x, y] as Pt, homes: [] }];
    }
    return piecesOf(name, own, houses);
  });
}

/** A street longer than this, from its first house to its last, is walked in pieces. */
export const PIECE_M = 400;
/** …but a piece keeps at least this many houses. */
const PIECE_MIN_HOUSES = 10;

/**
 * A long street in pieces of about equal houses along it (12 November 2026: in
 * one town territory a 3 km road with 191 houses ran through every part).
 */
function piecesOf(name: string, own: number[], houses: Pt[]): Street[] {
  const pts = own.map((i) => houses[i]);
  const k = scale(pts[0][1]);
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const x = (p[0] - mx) * k[0], y = (p[1] - my) * k[1];
    sxx += x * x; syy += y * y; sxy += x * y;
  }
  // The street's main direction, pointing east (or north when it runs north).
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(angle), uy = Math.sin(angle);
  if (ux < -1e-9 || (Math.abs(ux) < 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
  const along = own
    .map((i) => ({ i, t: (houses[i][0] - mx) * k[0] * ux + (houses[i][1] - my) * k[1] * uy }))
    .sort((a, b) => a.t - b.t);
  const length = along[along.length - 1].t - along[0].t;
  const n = Math.max(1, Math.min(Math.ceil(length / PIECE_M), Math.floor(own.length / PIECE_MIN_HOUSES)));
  const out: Street[] = [];
  for (let j = 0; j < n; j++) {
    const part = along.slice(Math.round((j * along.length) / n), Math.round(((j + 1) * along.length) / n));
    const x = part.reduce((a, q) => a + houses[q.i][0], 0) / part.length;
    const y = part.reduce((a, q) => a + houses[q.i][1], 0) / part.length;
    out.push({
      name,
      label: n === 1 ? name : `${name} (${j + 1}/${n})`,
      houses: part.length,
      at: [x, y],
      homes: part.map((q) => q.i),
    });
  }
  return out;
}

function dist(a: Pt, b: Pt): number {
  const k = scale((a[1] + b[1]) / 2);
  return Math.hypot((a[0] - b[0]) * k[0], (a[1] - b[1]) * k[1]);
}

/**
 * The streets in `parts` parts of about equal houses. First the territory is
 * halved again and again along its longer side where the houses balance;
 * then, while it makes the parts more even, a street at the edge of the
 * heaviest part moves to the neighbouring part it lies next to — never one
 * that would leave an island in another part's ground.
 */
export function splitStreets(streets: Street[], parts: number): Part[] {
  const cut = (list: Street[], n: number): Street[][] => {
    if (n <= 1 || list.length <= 1) return [list];
    const xs = list.map((s) => s.at[0]);
    const ys = list.map((s) => s.at[1]);
    const lat = (Math.min(...ys) + Math.max(...ys)) / 2;
    const k = scale(lat);
    const wide = (Math.max(...xs) - Math.min(...xs)) * k[0] >= (Math.max(...ys) - Math.min(...ys)) * k[1];
    const sorted = [...list].sort((a, b) => (wide ? a.at[0] - b.at[0] : a.at[1] - b.at[1]));
    const left = Math.floor(n / 2);
    const total = sorted.reduce((a, s) => a + Math.max(s.houses, 0), 0);
    const want = (total * left) / n;
    // The cut where the left side comes nearest to its share.
    let acc = 0;
    let at = 1;
    let bestGap = Infinity;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i].houses;
      const gap = Math.abs(acc - want);
      if (gap < bestGap) {
        bestGap = gap;
        at = i + 1;
      }
    }
    return [...cut(sorted.slice(0, at), left), ...cut(sorted.slice(at), n - left)];
  };
  const groups = cut(streets, Math.max(1, Math.floor(parts)));

  const sum = (g: Street[]) => g.reduce((a, s) => a + s.houses, 0);
  const spread = () => {
    const h = groups.map(sum);
    return Math.max(...h) - Math.min(...h);
  };
  const nearest = (s: Street, g: Street[]) =>
    g.reduce((m, o) => (o === s ? m : Math.min(m, dist(s.at, o.at))), Infinity);

  // Even out: at most a few hundred small moves, each one an improvement.
  for (let round = 0; round < 400 && groups.length > 1; round++) {
    const before = spread();
    const totals = groups.map(sum);
    const heavy = totals.indexOf(Math.max(...totals));
    const light = totals.indexOf(Math.min(...totals));
    let moved = false;
    const candidates: { s: Street; from: number; to: number; d: number }[] = [];
    // A street may go from the heaviest part to a neighbour, or from a
    // neighbour into the lightest — whichever evens the parts out.
    groups.forEach((g, from) => {
      if (g.length <= 1) return;
      for (const s of g) {
        const home = nearest(s, g);
        groups.forEach((other, to) => {
          if (to === from || other.length === 0) return;
          if (from !== heavy && to !== light) return;
          const d = nearest(s, other);
          // Next to that part, at least about as near as to its own: no islands.
          if (d <= home * 1.5) candidates.push({ s, from, to, d });
        });
      }
    });
    candidates.sort((a, b) => a.d - b.d);
    for (const c of candidates) {
      groups[c.from] = groups[c.from].filter((x) => x !== c.s);
      groups[c.to] = [...groups[c.to], c.s];
      if (spread() < before) {
        moved = true;
        break;
      }
      groups[c.to] = groups[c.to].filter((x) => x !== c.s);
      groups[c.from] = [...groups[c.from], c.s];
    }
    if (!moved) break;
  }

  return groups.map((list) => ({
    streets: list.map((s) => s.label ?? s.name).sort((a, b) => a.localeCompare(b, 'de')),
    houses: sum(list),
  }));
}

/** How even the parts are: the largest over the smallest, by houses (1 is perfect). */
export function unevenness(parts: Part[]): number {
  const h = parts.map((p) => p.houses);
  const min = Math.min(...h);
  return min === 0 ? Infinity : Math.max(...h) / min;
}
