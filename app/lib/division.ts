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

/** The streets of a part, those still to walk first, then in the server's order. */
export function streetsToWalk<T extends StreetLike>(streets: T[]): T[] {
  return [...streets].sort((a, b) => Number(!!a.walkedAt) - Number(!!b.walkedAt));
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
