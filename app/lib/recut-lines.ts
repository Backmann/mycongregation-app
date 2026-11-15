/**
 * The parts a cut's lines make, counted on the device while a line is
 * dragged (16 November 2026, step 3b of the draft of re-cutting).
 *
 * The server cuts the outline with a clipping library (reshape.ts
 * splitByLine, recut.ts partsOfCut); the app has none and may not get one
 * (a new package changes the runtime the phones are on). It does not need
 * one: the server's cut of a part by a line is the part inside, and the part
 * outside, one large polygon built from the line alone — its ends carried
 * far out, closed on the left of its overall direction. Which part a point
 * falls in is then a point-in-polygon test per line, the same arithmetic as
 * the server's, so the homes counted here are the homes the server counts
 * (scripts/check-recut-lines.mjs compares them with the server's own cut).
 *
 * The outlines of the parts themselves come from the server (the preview)
 * once the line is let go. Pure — no imports — so the gate can check it.
 */

export type Pt = [number, number];
type Ring = number[][];
export interface Outline {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

/** At most this many parts in one cut (the server's MAX_PARTS). */
export const MAX_PARTS = 8;
/** Homes this close to a line (m) are beside it: their street is divided. */
export const BESIDE_M = 25;
/** A larger change than this share of homes sends a decision back (REOPEN_SHARE). */
export const REOPEN_SHARE = 0.1;

/** How far the server carries a line's ends, in degrees (splitByLine's FAR). */
const FAR = 0.5;

function inRing([x, y]: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonsOf(g: Outline): Ring[][] {
  return g.type === 'Polygon' ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]);
}

export function insideOutline(p: Pt, g: Outline): boolean {
  return polygonsOf(g).some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** The middle of a line, halfway along its length (recut.ts middleOf). */
export function middleOf(line: Pt[]): Pt {
  let total = 0;
  for (let i = 1; i < line.length; i++)
    total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  let left = total / 2;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const d = Math.hypot(bx - ax, by - ay);
    if (d >= left && d > 0) {
      const t = left / d;
      return [ax + t * (bx - ax), ay + t * (by - ay)];
    }
    left -= d;
  }
  return line[0];
}

/** The line without repeated points (as splitByLine reads it). */
function cleanLine(raw: Pt[]): Pt[] {
  return raw.filter((p, i) => i === 0 || p[0] !== raw[i - 1][0] || p[1] !== raw[i - 1][1]);
}

/** The large polygon on the left of a line: what is inside stays in the part. */
function sideOf(line: Pt[]): Ring {
  const out = (from: Pt, to: Pt): Pt => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    return [to[0] + (dx / len) * FAR, to[1] + (dy / len) * FAR];
  };
  const start = out(line[1], line[0]);
  const end = out(line[line.length - 2], line[line.length - 1]);
  const path: Pt[] = [start, ...line, end];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * FAR * 4;
  const ny = (dx / len) * FAR * 4;
  return [...path, [end[0] + nx, end[1] + ny], [start[0] + nx, start[1] + ny], path[0]];
}

/** Why the lines cannot cut: which line and what is wrong with it. */
export interface CutProblem {
  line: number;
  why: 'short' | 'crosses' | 'notThrough' | 'many';
}

export interface Cut {
  /** Parts the lines make: one more than the lines. */
  parts: number;
  /** The part a point falls in, in the server's order; -1 outside the territory. */
  partOf: (p: Pt) => number;
  problem: CutProblem | null;
}

/**
 * The parts a territory's lines make, line after line as the server cuts:
 * each line cuts the part its middle lies in, the piece on its left keeps
 * the part's place, the other one is added at the end.
 */
export function cutOf(g: Outline, raw: Pt[][]): Cut {
  const lines = raw.map(cleanLine);
  const sides: Ring[] = [];
  const targets: number[] = [];
  const trace = (p: Pt, upto: number): number => {
    if (!insideOutline(p, g)) return -1;
    let idx = 0;
    for (let k = 0; k < upto; k++) if (idx === targets[k] && !inRing(p, sides[k])) idx = k + 1;
    return idx;
  };
  let problem: CutProblem | null = null;
  if (lines.length === 0 || lines.length + 1 > MAX_PARTS) problem = { line: 0, why: 'many' };
  for (let k = 0; k < lines.length && !problem; k++) {
    const line = lines[k];
    if (line.length < 2) {
      problem = { line: k, why: 'short' };
      break;
    }
    for (let i = 1; i < line.length && !problem; i++)
      for (let j = i + 2; j < line.length; j++)
        if (segmentsCross(line[i - 1], line[i], line[j - 1], line[j])) {
          problem = { line: k, why: 'crosses' };
          break;
        }
    if (problem) break;
    const target = trace(middleOf(line), k);
    if (target < 0) {
      problem = { line: k, why: 'notThrough' };
      break;
    }
    sides.push(sideOf(line));
    targets.push(target);
  }
  const n = sides.length;
  return {
    parts: problem ? 0 : n + 1,
    partOf: (p) => (problem ? -1 : trace(p, n)),
    problem,
  };
}

/** Homes in each part. */
export function homesByPart(cut: Cut, homes: Pt[]): number[] {
  const out = Array.from({ length: cut.parts }, () => 0);
  for (const h of homes) {
    const i = cut.partOf(h);
    if (i >= 0) out[i] += 1;
  }
  return out;
}

/**
 * The share of homes (0…1) the new lines put in another part than the
 * saved ones (recut.ts movedShare); another number of parts: 1.
 */
export function movedShare(before: Cut, after: Cut, homes: Pt[]): number {
  if (before.parts !== after.parts || before.problem || after.problem) return 1;
  let counted = 0;
  let moved = 0;
  for (const h of homes) {
    const a = before.partOf(h);
    if (a < 0) continue;
    counted += 1;
    if (after.partOf(h) !== a) moved += 1;
  }
  return counted === 0 ? 0 : moved / counted;
}

/** Metres between two points nearby (lon, lat). */
function metres(a: Pt, b: Pt): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110_540);
}

/** Metres from a point to a drawn line. */
export function metresToLine(p: Pt, line: Pt[]): number {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_540;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * kx;
    const ay = (line[i - 1][1] - p[1]) * ky;
    const bx = (line[i][0] - p[0]) * kx;
    const by = (line[i][1] - p[1]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  if (line.length === 1) best = metres(p, line[0]);
  return best;
}

/**
 * Homes of the territory beside each line (within BESIDE_M): a line drawn
 * along a street of houses divides its two sides between parts.
 */
export function besideCounts(g: Outline, lines: Pt[][], homes: Pt[]): number[] {
  const mine = homes.filter((h) => insideOutline(h, g));
  return lines.map((l) => mine.filter((h) => metresToLine(h, l) <= BESIDE_M).length);
}
