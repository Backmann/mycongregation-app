/**
 * Dividing a territory between groups (12 November 2026): its streets, laid
 * out in parts with about the same number of houses each.
 *
 * The map holds no house numbers, so a part is a set of whole streets. Each
 * building inside the territory goes to the nearest named street; a street
 * weighs as many houses as it got. The streets are then cut into parts by
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
  houses: number;
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

/** A house further than this from every named street is left out (a barn in a field). */
const FAR_M = 150;

/**
 * Each house to its nearest named street. Streets of the same name are one
 * street. Streets without a house stay, weighing nothing.
 */
export function streetsWithHouses(streets: StreetInput[], houses: Pt[]): Street[] {
  const byName = new Map<string, Pt[][]>();
  for (const s of streets) {
    const name = s.name.trim();
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), ...s.lines]);
  }
  const names = [...byName.keys()];
  const sums = names.map(() => ({ n: 0, x: 0, y: 0 }));
  for (const h of houses) {
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
    if (best >= 0) {
      sums[best].n += 1;
      sums[best].x += h[0];
      sums[best].y += h[1];
    }
  }
  return names.map((name, i) => {
    const s = sums[i];
    if (s.n > 0) return { name, houses: s.n, at: [s.x / s.n, s.y / s.n] as Pt };
    const pts = byName.get(name)!.flat();
    const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return { name, houses: 0, at: [x, y] as Pt };
  });
}

/**
 * The streets in `parts` parts of about equal houses: cut the set across its
 * longer side where the houses balance, and again in each half.
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
  return cut(streets, Math.max(1, Math.floor(parts))).map((list) => ({
    streets: list.map((s) => s.name).sort((a, b) => a.localeCompare(b, 'de')),
    houses: list.reduce((a, s) => a + s.houses, 0),
  }));
}

/** How even the parts are: the largest over the smallest, by houses (1 is perfect). */
export function unevenness(parts: Part[]): number {
  const h = parts.map((p) => p.houses);
  const min = Math.min(...h);
  return min === 0 ? Infinity : Math.max(...h) / min;
}
