/**
 * THE MAP'S LOOK, readable by anyone (R-67, Lionel 23 November 2026: «этой
 * функцией будут пользоваться многие и пожилого возраста … всем нужно быть
 * удобно и понятно»).
 *
 * The same OpenStreetMap file, the same Protomaps layers — only the colours
 * and sizes change, so nothing that reads the map's data (houses, streets,
 * the walks) moves. Measured before choosing (23 November 2026):
 *   - street names were #91888b: contrast 3.4 on white, 2.6 on the ground —
 *     under WCAG's 4.5. Now #1f2937 / #374151 on a white halo: 14.7 and 10.3;
 *   - every road was the same white: the main road could not be told from a
 *     lane. Main roads now pale cream with a darker edge, a third wider;
 *   - house numbers came only at zoom 18 and small; now from 16.5, larger.
 * The ground stays calm on purpose: the pairs' colours lie on it.
 * scripts/check-map-access.mjs holds these numbers.
 */
import type { BasemapsGlobal } from './map-libs';

/** Colours over Protomaps' «light» flavour (its key names). */
export const CLEAR_COLOURS: Record<string, string> = {
  background: '#e9e6e0',
  earth: '#f3f1ec',
  buildings: '#d8d2c8',
  park_a: '#dbe8de',
  park_b: '#b5dcc2',
  wood_a: '#dbe8db',
  wood_b: '#b9dfb9',
  water: '#9fd8e6',
  other: '#ffffff',
  minor_service: '#ffffff',
  minor_a: '#ffffff',
  minor_b: '#ffffff',
  link: '#fffaf0',
  major: '#fff3cf',
  highway: '#ffe7a3',
  bridges_major: '#fff3cf',
  minor_service_casing: '#cfc8bc',
  minor_casing: '#cfc8bc',
  link_casing: '#c9c1b3',
  major_casing_early: '#c4b48a',
  major_casing_late: '#c4b48a',
  highway_casing_early: '#c8a75a',
  highway_casing_late: '#c8a75a',
  railway: '#8f9a9d',
  roads_label_minor: '#374151',
  roads_label_minor_halo: '#ffffff',
  roads_label_major: '#1f2937',
  roads_label_major_halo: '#ffffff',
  address_label: '#4b5563',
  address_label_halo: '#ffffff',
};

/** How much larger: road names, house numbers, main roads. */
export const ROAD_NAME_SCALE = 1.15;
export const HOUSE_NUMBER_SCALE = 1.2;
export const MAIN_ROAD_SCALE = 1.35;
/** House numbers from this zoom (Protomaps: 18, too close for a walker). */
export const HOUSE_NUMBERS_FROM = 16.5;

/** The background's labels, raised above the pairs' streets so lines never hide them. */
export const BASE_LABELS = ['roads_labels_minor', 'roads_labels_major', 'address_label'] as const;
/** Which roads each name layer names (Protomaps 5.7: the same lists as its own filters). */
const NAMED_KINDS: Record<string, string[]> = {
  roads_labels_minor: ['minor_road', 'other', 'path'],
  roads_labels_major: ['highway', 'major_road'],
};

/**
 * A pair's own street names, drawn by the app along its lines (they are
 * there whatever room the background leaves): sizes by zoom. 16.5 px at
 * street level is the floor for people reading a phone at arm's length.
 */
export const PAIR_NAME_SIZE: [number, number][] = [
  [14, 13],
  [16, 16.5],
  [18, 18.5],
];

type Layer = Record<string, unknown> & {
  id: string;
  type: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  filter?: unknown;
  minzoom?: number;
};

/** A zoom curve stays the whole expression: its values are scaled, never the curve. */
export function scaled(v: unknown, f: number): unknown {
  if (typeof v === 'number') return Math.round(v * f * 100) / 100;
  if (Array.isArray(v) && v[0] === 'interpolate') return v.map((x, i) => (i >= 4 && i % 2 === 0 ? scaled(x, f) : x));
  if (Array.isArray(v) && v[0] === 'step') return v.map((x, i) => (i === 2 || (i >= 4 && i % 2 === 0) ? scaled(x, f) : x));
  return v;
}

/** The road-name filter, leaving out the streets the app names itself. */
export function roadNameFilter(id: string, without: readonly string[]): unknown {
  const kinds = NAMED_KINDS[id];
  const base = ['in', ['get', 'kind'], ['literal', kinds]];
  return without.length ? ['all', base, ['!', ['in', ['coalesce', ['get', 'name'], ''], ['literal', [...without]]]]] : base;
}

/** The background in the readable look, for every map of the territories. */
export function clearLayers(basemaps: BasemapsGlobal): Layer[] {
  const flavor = { ...(basemaps.namedFlavor('light') as Record<string, unknown>), ...CLEAR_COLOURS };
  return (basemaps.layers('protomaps', flavor, { lang: 'de' }) as Layer[]).map((l0) => {
    const l: Layer = JSON.parse(JSON.stringify(l0));
    if (l.type === 'line' && /^roads_(major|highway|link)/.test(l.id) && l.paint?.['line-width'] != null) {
      l.paint['line-width'] = scaled(l.paint['line-width'], MAIN_ROAD_SCALE);
    }
    if (l.id in NAMED_KINDS && l.layout) {
      l.filter = roadNameFilter(l.id, []);
      l.layout['text-size'] = scaled(l.layout['text-size'], ROAD_NAME_SCALE);
      l.paint = { ...l.paint, 'text-halo-width': 2 };
    }
    if (l.id === 'address_label' && l.layout) {
      l.minzoom = HOUSE_NUMBERS_FROM;
      l.layout['text-size'] = scaled(l.layout['text-size'], HOUSE_NUMBER_SCALE);
      l.paint = { ...l.paint, 'text-halo-width': 2 };
    }
    return l;
  });
}

/** The aerial photograph's tiles, through the congregation's own server (server map-photo). */
export function photoTilesUrl(apiBase: string): string {
  return `${apiBase.replace(/\/$/, '')}/map-photo/{z}/{x}/{y}.jpg`;
}

type Pt = [number, number];
const metres = (a: Pt, b: Pt): number => {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};
const lengthOf = (line: Pt[]): number => line.slice(1).reduce((s, c, i) => s + metres(line[i], c), 0);
/** The point a fraction of the way along a line (by metres, not by its vertices). */
export function along(line: Pt[], f: number): Pt {
  const goal = lengthOf(line) * f;
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const d = metres(line[i - 1], line[i]);
    if (s + d >= goal) {
      const k = d ? (goal - s) / d : 0;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * k, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * k];
    }
    s += d;
  }
  return line[line.length - 1];
}

/** A street shorter than this gets no number of its own: the next one carries it. */
export const BADGE_MIN_M = 120;

/**
 * THE PAIR'S NUMBER ON ITS LINES (R-67): colour alone never tells the pairs
 * apart — for the commonest colour blindness two of six pair colours were
 * nearly one (23 November 2026). A circle in the pair's colour with its
 * number, a quarter of the way along each of its longer streets (the middle
 * is where the street's name stands).
 */
export function pairBadges(
  routes: readonly { lines: Pt[][]; n?: number; link?: boolean; pale?: boolean; walked?: boolean; color: string }[],
): { lon: number; lat: number; n: number; color: string; pale: boolean; walked: boolean }[] {
  const out: { lon: number; lat: number; n: number; color: string; pale: boolean; walked: boolean }[] = [];
  for (const r of routes) {
    if (r.link || typeof r.n !== 'number') continue;
    const line = [...r.lines].sort((a, b) => lengthOf(b) - lengthOf(a))[0];
    if (!line || line.length < 2 || lengthOf(line) < BADGE_MIN_M) continue;
    const [lon, lat] = along(line, 0.25);
    out.push({ lon, lat, n: r.n, color: r.color, pale: !!r.pale, walked: !!r.walked });
  }
  return out;
}

/** Buttons a finger finds (R-67): MapLibre's own «+ / −» are 29 px. */
export const MAP_CONTROLS_CSS =
  '.maplibregl-ctrl-group button{width:44px;height:44px}' +
  '.maplibregl-ctrl-group button .maplibregl-ctrl-icon{background-size:30px}';

/** The Land's licence asks for nothing; the source is named all the same. */
export const PHOTO_ATTRIBUTION = 'Luftbild © Geobasis NRW';
