import type { CartDayView, CartSpan } from './api';

/**
 * Time at the stand, on the half-hour (2 November 2026) — the app's side of
 * the server's cart-time.ts. A day at a place has its hours; people stand
 * spans of it, an hour or more. Pure functions for the screens: what to
 * draw, what to offer.
 */

export const STEP = 30;
export const MIN_SPAN = 60;
export const CAPACITY_MAX = 4;

export function toMin(hhmm: string): number {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function overlaps(a: CartSpan, b: CartSpan): boolean {
  return toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
}

export function minutes(s: CartSpan): number {
  return toMin(s.endTime) - toMin(s.startTime);
}

/** What remains of a span once the called-off parts are taken out. */
export function minus(span: CartSpan, off: CartSpan[]): CartSpan[] {
  let parts: [number, number][] = [[toMin(span.startTime), toMin(span.endTime)]];
  for (const o of off) {
    const oa = toMin(o.startTime);
    const ob = toMin(o.endTime);
    const next: [number, number][] = [];
    for (const [a, b] of parts) {
      if (ob <= a || oa >= b) {
        next.push([a, b]);
        continue;
      }
      if (oa > a) next.push([a, oa]);
      if (ob < b) next.push([ob, b]);
    }
    parts = next;
  }
  return parts.map(([a, b]) => ({ startTime: toHHMM(a), endTime: toHHMM(b) }));
}

/** Spans that touch or overlap, joined: 10–11 + 11–12 = 10–12. */
export function merge(spans: CartSpan[]): CartSpan[] {
  const sorted = [...spans].sort((x, y) => toMin(x.startTime) - toMin(y.startTime));
  const out: [number, number][] = [];
  for (const s of sorted) {
    const a = toMin(s.startTime);
    const b = toMin(s.endTime);
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => ({ startTime: toHHMM(a), endTime: toHHMM(b) }));
}

/** The half-hours of a day, as «HH:MM». */
export function halfHours(day: CartSpan): string[] {
  const out: string[] = [];
  for (let t = toMin(day.startTime); t < toMin(day.endTime); t += STEP) out.push(toHHMM(t));
  return out;
}

/** How many stand (or wish to) at each half-hour of a day. */
export function coverage(day: CartSpan, people: CartSpan[]): number[] {
  return halfHours(day).map((t) => {
    const m = toMin(t);
    return people.filter((p) => toMin(p.startTime) <= m && m < toMin(p.endTime)).length;
  });
}

/** «10:00–12:00». */
export function spanText(s: CartSpan): string {
  return `${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}`;
}

/**
 * Where a span sits in its day, for a bar: left and width in percent.
 */
export function barOf(day: CartSpan, s: CartSpan): { left: `${number}%`; width: `${number}%` } {
  const a = toMin(day.startTime);
  const len = toMin(day.endTime) - a || 1;
  const l = ((Math.max(toMin(s.startTime), a) - a) / len) * 100;
  const w = ((Math.min(toMin(s.endTime), toMin(day.endTime)) - Math.max(toMin(s.startTime), a)) / len) * 100;
  return { left: `${l}%`, width: `${Math.max(w, 0)}%` };
}

/** The spans of the day that are not called off. */
export function liveSpans(day: CartDayView, spans: CartSpan[]): CartSpan[] {
  return spans.flatMap((s) => minus(s, day.cancellations));
}
