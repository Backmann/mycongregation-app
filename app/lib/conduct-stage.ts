/**
 * THE CHAIRMAN'S SCREEN AT THE LECTERN (18 October 2026) — the rules it draws
 * by, kept apart from the screen so scripts/check-conduct-stage.mjs can pin
 * them. Pure: no imports.
 *
 * Decided by Lionel on 18 October: the timekeeper taps, the chairman only
 * looks; a laptop (later perhaps a tablet) lies by the lectern, and only the
 * chairman sees it. During the counsel the screen shows no numbers.
 */

/**
 * When the countdown turns amber: one minute before the end on a part of five
 * minutes or more (a talk, the Treasures, the study), thirty seconds on a
 * short one (a student's three or four minutes). On a long part thirty
 * seconds is too late to round a thought off; on a three-minute part a whole
 * amber minute is a third of it and stops meaning anything.
 */
export function warnSecFor(partMin: number): number {
  return partMin >= 5 ? 60 : 30;
}

export type StageTone = 'calm' | 'soon' | 'over';

/** The colour of a countdown with `leftSec` to go on a part of `partMin`. */
export function stageTone(leftSec: number, partMin: number): StageTone {
  if (leftSec < 0) return 'over';
  return leftSec <= warnSecFor(partMin) ? 'soon' : 'calm';
}

/** Before the first tap: how long until the programme's start (negative — late). */
export function untilStartSec(startHHMM: string | null, meetingDayISO: string | null, nowMs: number): number | null {
  const at = momentOf(startHHMM, meetingDayISO);
  return at === null ? null : Math.round((at - nowMs) / 1000);
}

/** A wall-clock moment of the meeting day, «19:00» on «2026-10-21». */
function momentOf(hhmm: string | null, dayISO: string | null): number | null {
  if (!hhmm || !dayISO) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayISO);
  if (!t || !d) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0).getTime();
}

/**
 * How far behind (positive) or ahead the meeting will end against the
 * programme's own end — so a late START counts too (Lionel, 18 October: «the
 * meeting must begin and end on time»). The old figure summed the parts only
 * and called a meeting begun ten minutes late «по плану».
 *
 * Only on the meeting's own day and within three hours of the programme's
 * end; anywhere else (a test on another day, a wrong setting) the parts-only
 * figure stands.
 */
export const DRIFT_SANE_SEC = 3 * 3600;
export function endDriftSec(
  endsAtMs: number,
  plannedEndHHMM: string | null,
  meetingDayISO: string | null,
  partsOnlySec: number,
): number {
  const planned = momentOf(plannedEndHHMM, meetingDayISO);
  if (planned === null) return partsOnlySec;
  const d = Math.round((endsAtMs - planned) / 1000);
  return Math.abs(d) > DRIFT_SANE_SEC ? partsOnlySec : d;
}

/**
 * Before the first tap, the big countdown («через 2:43») shows only within
 * this long of the start; earlier the screen shows the start time itself.
 */
export const COUNTDOWN_FROM_SEC = 3600;

/**
 * «ПРОВЕРИТЬ ЭКРАН»: the week's own programme run through quickly, on this
 * device only — nothing goes to the server, nothing is saved. Each part shows
 * every state the real screen has: calm, amber, over time, and the counsel
 * after a student part. About two minutes for a whole midweek meeting.
 */
export const DEMO_CALM_MS = 3000;
export const DEMO_WARN_MS = 2500;
export const DEMO_OVER_MS = 1500;
export const DEMO_COUNSEL_MS = 2000;
/** How far over time the demo goes before the next part. */
export const DEMO_OVER_SEC = 12;
/** Where the calm stretch ends, above the amber line. */
const DEMO_CALM_END_ABOVE_WARN_SEC = 8;

export interface DemoSegment {
  partMin: number;
  counselMin: number;
}

export type DemoFrame =
  | { phase: 'part'; index: number; leftSec: number }
  | { phase: 'counsel'; index: number }
  | { phase: 'done' };

function segmentMs(s: DemoSegment): number {
  return DEMO_CALM_MS + DEMO_WARN_MS + DEMO_OVER_MS + (s.counselMin > 0 ? DEMO_COUNSEL_MS : 0);
}

/** What the demo shows `elapsedMs` after it began. */
export function demoFrame(segments: DemoSegment[], elapsedMs: number): DemoFrame {
  let t = Math.max(0, elapsedMs);
  for (let index = 0; index < segments.length; index++) {
    const s = segments[index];
    const total = segmentMs(s);
    if (t >= total) {
      t -= total;
      continue;
    }
    const full = s.partMin * 60;
    const warn = warnSecFor(s.partMin);
    const calmEnd = Math.min(full, warn + DEMO_CALM_END_ABOVE_WARN_SEC);
    if (t < DEMO_CALM_MS) {
      const k = t / DEMO_CALM_MS;
      return { phase: 'part', index, leftSec: Math.round(full - (full - calmEnd) * k) };
    }
    t -= DEMO_CALM_MS;
    if (t < DEMO_WARN_MS) {
      const k = t / DEMO_WARN_MS;
      return { phase: 'part', index, leftSec: Math.round(Math.min(calmEnd, warn) * (1 - k)) };
    }
    t -= DEMO_WARN_MS;
    if (t < DEMO_OVER_MS) {
      const k = t / DEMO_OVER_MS;
      return { phase: 'part', index, leftSec: -Math.max(1, Math.round(DEMO_OVER_SEC * k)) };
    }
    return { phase: 'counsel', index };
  }
  return { phase: 'done' };
}

/** How long the demo of these segments runs, ms. */
export function demoLengthMs(segments: DemoSegment[]): number {
  return segments.reduce((sum, s) => sum + segmentMs(s), 0);
}
