/**
 * Small words and sums of the territory section (11 November 2026).
 */
import type { TerritoryGeometry } from './api';

/** '2026-09-03' as «3 сент. 2026», the year left out when it is this year. */
export function formatDayShort(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** 'YYYY-MM-DD' plus whole days. */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** The server's term: four months (about 120 days). */
export const TERM_DAYS = 120;

/** «Due soon» starts two weeks before the day (the reminder's day, too). */
export const DUE_SOON_DAYS = 14;

/**
 * How a territory stands, for its colour on the map and its place in the
 * list:
 *  - overdue — held past its day;
 *  - held — given out, within its term;
 *  - idle — free and not worked for more than a year (give these out first);
 *  - free — free, worked within the year.
 */
export type TerritoryTone = 'overdue' | 'held' | 'idle' | 'free';

export function toneOf(
  row: { holder: { dueOn: string | null } | null; lastCompletedOn: string | null },
  today: string,
): TerritoryTone {
  if (row.holder) {
    return row.holder.dueOn && row.holder.dueOn < today ? 'overdue' : 'held';
  }
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  return !row.lastCompletedOn || row.lastCompletedOn < yearAgo ? 'idle' : 'free';
}

export const TONE_COLOR: Record<TerritoryTone | 'mine', string> = {
  overdue: '#c2410c',
  held: '#15803d',
  idle: '#0e7490',
  free: '#94a3b8',
  mine: '#0e7490',
};

/** Every point of a Polygon or MultiPolygon. */
function pointsOf(g: TerritoryGeometry): [number, number][] {
  const out: [number, number][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      out.push([c[0] as number, c[1] as number]);
    } else if (Array.isArray(c)) {
      for (const x of c) walk(x);
    }
  };
  walk(g.coordinates);
  return out;
}

export type Box = [[number, number], [number, number]];

/** The box around one or more shapes, or null when there is none. */
export function boxOf(shapes: TerritoryGeometry[]): Box | null {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const g of shapes) {
    for (const [x, y] of pointsOf(g)) {
      if (x < x1) x1 = x;
      if (y < y1) y1 = y;
      if (x > x2) x2 = x;
      if (y > y2) y2 = y;
    }
  }
  return Number.isFinite(x1) ? [[x1, y1], [x2, y2]] : null;
}

/** The middle of a shape's box: where «Маршрут» leads. */
export function middleOf(g: TerritoryGeometry): { lat: number; lng: number } | null {
  const b = boxOf([g]);
  if (!b) return null;
  return { lng: (b[0][0] + b[1][0]) / 2, lat: (b[0][1] + b[1][1]) / 2 };
}

/**
 * A link to the phone's own navigation (Google Maps, or whatever the phone
 * opens such links with). The user taps it himself; the app sends nothing.
 */
export function routeLink(g: TerritoryGeometry): string | null {
  const m = middleOf(g);
  if (!m) return null;
  const at = `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${at}`;
}
