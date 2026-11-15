/**
 * The buildings of a territory as the keepers look at them (15 November
 * 2026, «Жилые дома»): what each one is on the map, which to look at, in
 * what order. Pure — no imports — so the gate can check it
 * (scripts/check-homes.mjs). About buildings only, never about people.
 */

export interface HomeHouse {
  key: string;
  lon: number;
  lat: number;
  areaM2: number;
  numbers: string | null;
  label: string | null;
  near: { label: string; m: number } | null;
  official: string | null;
  use: 'home' | 'not' | 'unsure' | null;
  home: boolean;
  byRule: boolean;
  mark: boolean | null;
  pieceOf: string | null;
}

/**
 * What a building is on the map: a home; not a home; a further piece of a
 * house, counted with it (drawn apart, so that nobody marks it «a home» and
 * counts the house twice); the cadastre unsure, or not knowing it.
 */
export type HomeState = 'home' | 'not' | 'piece' | 'unsure';

export function stateOf(h: HomeHouse): HomeState {
  if (h.mark !== null) return h.home ? 'home' : 'not';
  if (h.pieceOf !== null && !h.home) return 'piece';
  if (h.use === 'unsure' || h.use === null) return 'unsure';
  return h.home ? 'home' : 'not';
}

/** Looked at by the keepers: the cadastre unsure or silent, and no mark yet. */
export function toLookAt(h: HomeHouse): boolean {
  return h.mark === null && (h.use === 'unsure' || h.use === null);
}

export type HomeFilter = 'all' | 'unsure' | 'not' | 'marked';

export function filterHomes(houses: HomeHouse[], f: HomeFilter): HomeHouse[] {
  if (f === 'unsure') return houses.filter(toLookAt);
  if (f === 'not') return houses.filter((h) => !h.home);
  if (f === 'marked') return houses.filter((h) => h.mark !== null);
  return houses;
}

/** «Ahornweg 12» → street and number, for ordering by street. */
function streetOf(h: HomeHouse): { street: string; n: number; rest: string } {
  const text = h.label ?? h.near?.label ?? '';
  const m = /^(.*?)\s+(\d+)\s*(\S*)$/.exec(text);
  if (!m) return { street: text, n: Number.MAX_SAFE_INTEGER, rest: '' };
  return { street: m[1], n: Number(m[2]), rest: m[3] };
}

/**
 * By street, then number (2 before 10, 12 before 12a), then those without
 * an address of their own after the house they stand by: the way one reads
 * a map, street by street.
 */
export function byStreet(houses: HomeHouse[]): HomeHouse[] {
  return [...houses].sort((a, b) => {
    const x = streetOf(a);
    const y = streetOf(b);
    return (
      x.street.localeCompare(y.street) ||
      x.n - y.n ||
      x.rest.localeCompare(y.rest) ||
      Number(a.label === null) - Number(b.label === null) ||
      a.key.localeCompare(b.key)
    );
  });
}

/**
 * The next building to look at after `key` (in street order), round to the
 * first; null when none is left.
 */
export function nextToLookAt(houses: HomeHouse[], key: string | null): HomeHouse | null {
  const list = byStreet(houses).filter(toLookAt);
  if (list.length === 0) return null;
  if (key === null) return list[0];
  const sorted = byStreet(houses);
  const from = sorted.findIndex((h) => h.key === key);
  for (let i = 1; i <= sorted.length; i++) {
    const h = sorted[(from + i) % sorted.length];
    if (toLookAt(h) && h.key !== key) return h;
  }
  return null;
}

/** The colours of the map, told apart by lightness too. */
export const HOME_COLORS: Record<HomeState, { fill: string; ring: string }> = {
  home: { fill: '#1f6474', ring: '' },
  not: { fill: '#9aa6ad', ring: '' },
  piece: { fill: '#8fbcc6', ring: '#1f6474' },
  unsure: { fill: '#fdf1df', ring: '#b45f06' },
};
