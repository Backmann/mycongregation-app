/**
 * The way on a part of a divided territory (14 November 2026, «куда идти»):
 * where the walker is against his streets — which street is now, how far and
 * which way to it, where the phone points. Pure — no imports — so the gate
 * can check it (scripts/check-way.mjs). Nothing here leaves the phone.
 */

export type LonLat = [number, number];

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Metres between two points (haversine). */
export function metres(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The compass direction from a to b, 0 = north, clockwise, 0–360. */
export function bearing(a: LonLat, b: LonLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point of the lines nearest to p, and how far it is. */
export function nearestOn(p: LonLat, lines: LonLat[][]): { at: LonLat; m: number } | null {
  // Flat metres round p: fine for the few hundred metres of a street.
  const kx = 111_320 * Math.cos(rad(p[1]));
  const ky = 110_540;
  let best: { at: LonLat; m: number } | null = null;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      const b = line[i + 1] ?? a;
      const ax = (a[0] - p[0]) * kx;
      const ay = (a[1] - p[1]) * ky;
      const bx = (b[0] - p[0]) * kx;
      const by = (b[1] - p[1]) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const x = ax + t * dx;
      const y = ay + t * dy;
      const m = Math.hypot(x, y);
      if (!best || m < best.m) best = { at: [p[0] + x / kx, p[1] + y / ky], m };
    }
  }
  return best;
}

/** Close enough to a street to be on it. */
export const ON_STREET_M = 25;
/** Far enough from «now» that another street close by is where one is. */
export const LEFT_STREET_M = 60;

export interface WayStreet {
  key: string;
  walkedAt: string | null;
  lines: LonLat[][];
}

/**
 * The street to walk now: the first not walked, in walking order — unless
 * the walker stands on another street not walked and is well away from
 * that first one; then that one (he went another way: follow him, not the
 * list). Null when everything is walked.
 */
export function streetNow<T extends WayStreet>(streets: T[], here: LonLat | null): T | null {
  const open = streets.filter((s) => !s.walkedAt);
  if (open.length === 0) return null;
  const first = open[0];
  if (!here) return first;
  const away = nearestOn(here, first.lines);
  if (away && away.m <= LEFT_STREET_M) return first;
  let on: { s: T; m: number } | null = null;
  for (const s of open.slice(1)) {
    const n = nearestOn(here, s.lines);
    if (n && n.m <= ON_STREET_M && (!on || n.m < on.m)) on = { s, m: n.m };
  }
  return on ? on.s : first;
}

/** Which way and how far to a street, from where one stands. */
export function wayTo(here: LonLat, lines: LonLat[][]): { to: LonLat; m: number; bearing: number } | null {
  const n = nearestOn(here, lines);
  if (!n) return null;
  return { to: n.at, m: n.m, bearing: bearing(here, n.at) };
}

/**
 * Where one stands against the road to a street (14 November 2026): how
 * far off it, the nearest point on it, and the metres still to go along it
 * from there to the street.
 */
export function alongLink(
  here: LonLat,
  link: LonLat[],
): { off: number; at: LonLat; left: number; next: LonLat } | null {
  if (link.length < 2) return null;
  const n = nearestOn(here, [link]);
  if (!n) return null;
  // The segment the nearest point lies on, then the rest of the line.
  let seg = 0;
  let best = Infinity;
  for (let i = 0; i < link.length - 1; i++) {
    const d = nearestOn(n.at, [[link[i], link[i + 1]]])?.m ?? Infinity;
    if (d < best) {
      best = d;
      seg = i;
    }
  }
  let left = metres(n.at, link[seg + 1]);
  for (let i = seg + 1; i < link.length - 1; i++) left += metres(link[i], link[i + 1]);
  return { off: n.m, at: n.at, left, next: link[seg + 1] };
}

/** Near enough to the road to a street to be on it. */
export const ON_LINK_M = 40;

/**
 * How to go on to the street of now (14 November 2026): along its road
 * when one is on that road, to the road when it is nearer than the street,
 * else straight to the street. `guide`: where a dashed line should lead
 * (null: none, the road itself shows the way); `m`: metres still to go;
 * `bearing`: which way to turn.
 */
export function goOn(
  here: LonLat,
  street: { lines: LonLat[][]; link?: LonLat[] | null },
): { m: number; bearing: number; guide: LonLat | null; via: 'street' | 'road' | 'toRoad' } | null {
  const direct = wayTo(here, street.lines);
  if (!direct) return null;
  const road = street.link ? alongLink(here, street.link) : null;
  if (direct.m > ON_STREET_M && road) {
    if (road.off <= ON_LINK_M) {
      const ahead = metres(here, road.next) > 5 ? road.next : road.at;
      return { m: road.left + road.off, bearing: bearing(here, ahead), guide: null, via: 'road' };
    }
    if (road.off < direct.m)
      return { m: road.off + road.left, bearing: bearing(here, road.at), guide: road.at, via: 'toRoad' };
  }
  return { m: direct.m, bearing: direct.bearing, guide: direct.m > 15 ? direct.to : null, via: 'street' };
}

/**
 * A distance rounded the way one says it: tens of metres below a
 * kilometre, tenths of a kilometre above («90 m», «1.2 km»); the words
 * are the screen's.
 */
export function roundDistance(m: number): { unit: 'm' | 'km'; n: number } {
  if (m < 1000) return { unit: 'm', n: Math.max(10, Math.round(m / 10) * 10) };
  return { unit: 'km', n: Math.round(m / 100) / 10 };
}

/** Metres along lines. */
export function lineMetres(lines: LonLat[][]): number {
  let m = 0;
  for (const l of lines) for (let i = 1; i < l.length; i++) m += metres(l[i - 1], l[i]);
  return m;
}

/**
 * The walk of some streets in order (14 November 2026): the road to each
 * (its `link`) and the street itself, in metres — of the first `upto`, or
 * of those not yet walked among them.
 */
export function walkOf(
  streets: { lines: LonLat[][]; link?: LonLat[] | null; walkedAt?: string | null }[],
  upto: number,
  open = false,
): number {
  let m = 0;
  streets.slice(0, upto).forEach((s) => {
    if (open && s.walkedAt) return;
    m += lineMetres(s.lines) + (s.link ? lineMetres([s.link]) : 0);
  });
  return m;
}

/** The box round some points, for the map to show them: [[w, s], [e, n]]. */
export function boxAround(points: LonLat[]): [LonLat, LonLat] | null {
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [
    [w, s],
    [e, n],
  ];
}

/**
 * Where the phone points, 0 = north, from a browser's orientation event:
 * Safari's own compass first, else an absolute alpha (counter-clockwise),
 * corrected for a phone held sideways. Null when the event knows no north.
 */
export function headingOf(
  e: { webkitCompassHeading?: number | null; alpha?: number | null; absolute?: boolean },
  screenAngle = 0,
): number | null {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
  else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;
  if (h === null) return null;
  return (((h + screenAngle) % 360) + 360) % 360;
}

/** A shaking compass, calmed: the next reading eased in, the short way round. */
export function easeAngle(prev: number | null, next: number, k = 0.25): number {
  if (prev === null) return next;
  const d = ((next - prev + 540) % 360) - 180;
  return (((prev + d * k) % 360) + 360) % 360;
}

/** A circle of `m` metres round p, as a ring of points (the GPS's doubt). */
export function circle(p: LonLat, m: number, steps = 32): LonLat[] {
  const kx = 111_320 * Math.cos(rad(p[1]));
  const ky = 110_540;
  const out: LonLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    out.push([p[0] + (Math.sin(a) * m) / kx, p[1] + (Math.cos(a) * m) / ky]);
  }
  return out;
}

/** A beam from p toward `heading`, `m` metres long and `spread` degrees wide. */
export function beam(p: LonLat, heading: number, m = 45, spread = 50, steps = 10): LonLat[] {
  const kx = 111_320 * Math.cos(rad(p[1]));
  const ky = 110_540;
  const out: LonLat[] = [p];
  for (let i = 0; i <= steps; i++) {
    const a = rad(heading - spread / 2 + (spread * i) / steps);
    out.push([p[0] + (Math.sin(a) * m) / kx, p[1] + (Math.cos(a) * m) / ky]);
  }
  out.push(p);
  return out;
}
