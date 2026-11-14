/**
 * A territory divided between groups for a day (13 November 2026; mockup
 * «Участок на группы»): what the screens show of the server's division.
 * Pure — no imports — so the gate can check it (scripts/check-division.mjs).
 */

export interface StreetLike {
  key: string;
  name: string;
  from: string | null;
  to: string | null;
  piece: number;
  pieces: number;
  houses: number;
  walkedAt: string | null;
  /** A side of a main road; null or absent: both sides. */
  side?: Side | null;
  /** Its house numbers, lowest to highest; null when too few are known. */
  range?: { from: string; to: string } | null;
  /** Odd and even numbers each on their own («1–35 · 2–40»). */
  ranges?: NumberRanges;
}

export interface NumberRanges {
  odd: { from: string; to: string } | null;
  even: { from: string; to: string } | null;
}

/** A side of a main road: by its numbers when they agree, else by the compass. */
export interface Side {
  parity: 'even' | 'odd' | null;
  toward: 'n' | 's' | 'e' | 'w';
}

export interface PartLike {
  n: number;
  houses: number;
  streets: StreetLike[];
}

/** One colour per part, the same on every screen and on paper. */
export const PART_COLORS = [
  '#0e7490',
  '#c2410c',
  '#7c3aed',
  '#15803d',
  '#db2777',
  '#a16207',
  '#2563eb',
  '#475569',
];

export const WALKED_COLOR = '#16a34a';

export function partColor(n: number): string {
  return PART_COLORS[(n - 1) % PART_COLORS.length];
}

/** How many groups one may ask for, and the first offer. */
export const PARTS_MIN = 2;
export const PARTS_MAX = 6;
export const PARTS_FIRST = 2;

/**
 * Which words name a piece of a long street: «from X to Y», «up to Y»,
 * «from X», or its number when no street crosses where it is cut. A whole
 * street needs none.
 */
export type PieceWords =
  | { key: 'whole' }
  | { key: 'between'; from: string; to: string }
  | { key: 'upTo'; to: string }
  | { key: 'from'; from: string }
  | { key: 'nth'; piece: number; pieces: number };

export function pieceWords(s: StreetLike): PieceWords {
  if (s.pieces <= 1) return { key: 'whole' };
  if (s.from && s.to) return { key: 'between', from: s.from, to: s.to };
  // The first piece has no «from», the last no «to»: they run to the end.
  if (s.to && s.piece === 1) return { key: 'upTo', to: s.to };
  if (s.from && s.piece === s.pieces) return { key: 'from', from: s.from };
  return { key: 'nth', piece: s.piece, pieces: s.pieces };
}

/**
 * Which word names a side (13 November 2026, «Пары на участке»): «чётная» /
 * «нечётная» when the numbers agree, else where it lies — «северная» etc.
 * Null: a quiet street, walked on both sides.
 */
export type SideWord = 'even' | 'odd' | 'n' | 's' | 'e' | 'w';

export function sideWord(s: { side?: Side | null }): SideWord | null {
  if (!s.side) return null;
  return s.side.parity ?? s.side.toward;
}

const fromTo = (r: { from: string; to: string }) => (r.from === r.to ? r.from : `${r.from}–${r.to}`);

/**
 * The numbers of a street as the doors say them (14 November 2026): the odd
 * side and the even side each on its own, «1–35 · 2–40»; one side only on
 * a side of a main road. Without them, the old single range «2–84»; null
 * when too few numbers are known.
 */
export function rangeText(s: {
  range?: { from: string; to: string } | null;
  ranges?: NumberRanges;
}): string | null {
  if (s.ranges) {
    const rows = [s.ranges.odd, s.ranges.even].filter((r): r is { from: string; to: string } => !!r);
    return rows.length ? rows.map(fromTo).join(' · ') : null;
  }
  return s.range ? fromTo(s.range) : null;
}

/**
 * The pair across the road: another part walking the other side of the same
 * main road. Said on the street («напротив идёт пара 1») so two pairs on one
 * road know each other and do not ring the same doors.
 */
export function partAcross(parts: PartLike[], n: number, street: StreetLike): number | null {
  if (!street.side) return null;
  for (const p of parts) {
    if (p.n === n) continue;
    for (const x of p.streets) {
      if (x.name !== street.name || !x.side) continue;
      const other =
        street.side.parity && x.side.parity
          ? x.side.parity !== street.side.parity
          : x.side.toward !== street.side.toward;
      if (other) return p.n;
    }
  }
  return null;
}

/** A tick made without a connection, waiting on the phone to be sent. */
export interface PendingTick {
  key: string;
  walked: boolean;
  /** When it was ticked, ISO. */
  at: string;
}

/** A newer tick of the same street replaces the older; nothing else is lost. */
export function addTick(queue: PendingTick[], tick: PendingTick): PendingTick[] {
  return [...queue.filter((q) => q.key !== tick.key), tick];
}

/**
 * The streets as the walker sees them: the server's answer with the ticks
 * still waiting on the phone laid over it, marked `pending`.
 */
export function withTicks<T extends StreetLike>(
  streets: T[],
  queue: PendingTick[],
): (T & { pending: boolean })[] {
  return streets.map((s) => {
    const q = queue.find((x) => x.key === s.key);
    if (!q) return { ...s, pending: false };
    return { ...s, walkedAt: q.walked ? q.at : null, pending: true };
  });
}

/** Streets walked and houses on them, of a part or of all parts. */
export function walkedOf(parts: PartLike[]): {
  streets: number;
  streetsWalked: number;
  houses: number;
  housesWalked: number;
} {
  let streets = 0;
  let streetsWalked = 0;
  let houses = 0;
  let housesWalked = 0;
  for (const p of parts) {
    for (const s of p.streets) {
      streets += 1;
      houses += s.houses;
      if (s.walkedAt) {
        streetsWalked += 1;
        housesWalked += s.houses;
      }
    }
  }
  return { streets, streetsWalked, houses, housesWalked };
}

/** A part is done when every street of it is walked. */
export function partDone(p: PartLike): boolean {
  return p.streets.length > 0 && p.streets.every((s) => s.walkedAt);
}

/**
 * The streets of a part, those still to walk first, then in the server's
 * order. Kept for the old screens; the new ones keep the walking order and
 * number it (see `walkingOrder`).
 */
export function streetsToWalk<T extends StreetLike>(streets: T[]): T[] {
  return [...streets].sort((a, b) => Number(!!a.walkedAt) - Number(!!b.walkedAt));
}

/** The streets of a part in walking order, numbered from 1, as on the map. */
export function walkingOrder<T extends StreetLike>(streets: T[]): (T & { step: number })[] {
  return streets.map((s, i) => ({ ...s, step: i + 1 }));
}

/**
 * Whether the territory may be marked worked: every street of the division
 * walked, and the one asking may end it (the holder, a keeper).
 */
export function offerComplete(parts: PartLike[], mayComplete: boolean): boolean {
  if (!mayComplete || parts.length === 0) return false;
  return parts.every((p) => partDone(p));
}

/** A street of another part that a pair done early may take: that part not started. */
export function streetsToTake<P extends PartLike & { untouched?: boolean }>(
  parts: P[],
  n: number,
): { from: number; street: P['streets'][number] }[] {
  return parts
    .filter((p) => p.n !== n && p.untouched !== false && !p.streets.some((x) => x.walkedAt))
    .flatMap((p) => p.streets.map((street) => ({ from: p.n, street })));
}

/** The route to a point (lon, lat), in the phone's maps. */
export function routeTo(p: [number, number] | null): string | null {
  if (!p) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${p[1].toFixed(5)},${p[0].toFixed(5)}`;
}

/** «10:42» from an ISO time, on the reader's own clock. */
export function clockOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
