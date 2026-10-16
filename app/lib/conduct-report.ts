/**
 * THE DETAILED RESULT OF A MIDWEEK MEETING — the numbers behind the screen
 * (item 4 of the conduct plan, mockup approved by Lionel on 16 October 2026).
 *
 * Everything here is computed from what a saved result already holds — per
 * part the programme's seconds, the seconds it took, the counsel after it and
 * (from 16 October) when it began — plus the meeting's total. Nothing is
 * stored twice and nothing is invented: where a result is older and does not
 * know when its parts began, the curve is drawn without the pauses and says
 * so (`timed: false`), rather than guessing where they fell.
 *
 * WHY THE PAUSES ARE PLACED (Lionel, 16 October 2026). Without them the curve
 * ended at a different number than the meeting's total over the programme —
 * two answers to one question, and the reader trusts neither. With them the
 * curve ends exactly on the total, and its peak is the real one.
 *
 * No ratings of brothers: the report shows what happened to each part, in
 * the programme's order or by how far it went from the programme — never a
 * ranking of people.
 *
 * NO IMPORTS, on purpose: scripts/check-conduct-report.mjs loads this file on
 * its own.
 */

/** A transition shorter than this is not called a pause. */
export const PAUSE_MIN_SEC = 20;
/** Within this, a part is «on time» (±0). */
export const ON_TIME_SEC = 5;

/** The sections a midweek part belongs to; opening and closing are no section. */
export type ReportSection = 'opening' | 'treasures' | 'apply_yourself' | 'christian_life' | 'closing';

export interface ReportSegmentIn {
  key: string;
  /** The programme's seconds for the part itself (no counsel). */
  plannedSec: number;
  actualSec: number;
  /** The counsel given after it, or null. */
  counselSec: number | null;
  /** When it began, seconds from the meeting's start; null/absent when not known. */
  startSec?: number | null;
}

export interface ReportRow {
  /** Position in the programme. */
  index: number;
  key: string;
  section: ReportSection;
  plannedSec: number;
  actualSec: number;
  /** actual − planned, the part alone. */
  devSec: number;
  /** The programme's counsel after it (60 for a student part), else 0. */
  counselPlannedSec: number;
  counselSec: number | null;
  /** counsel − its programme minute, or null when no counsel was given. */
  counselDevSec: number | null;
  /** The pause after this part, before the next began (only when timed). */
  pauseAfterSec: number | null;
  /** The part's own deviation plus its counsel's — what «по отклонению» sorts by. */
  weightSec: number;
  /** Where the part lies on the curve's time axis, seconds from the start (counsel included). */
  fromX: number;
  toX: number;
}

export interface ReportPoint {
  /** Seconds since the meeting's start. */
  x: number;
  /** Seconds behind the programme (negative: ahead). */
  y: number;
  /** The row this point ends (or, for a pause, follows). */
  index: number;
  /** The stretch leading to this point was a pause between parts. */
  pause: boolean;
}

export interface ReportSectionSum {
  section: ReportSection;
  plannedSec: number;
  actualSec: number;
}

export interface ConductReport {
  rows: ReportRow[];
  totalSec: number;
  plannedSec: number;
  /** total − planned: the meeting over (positive) or under its programme. */
  overSec: number;
  /** The time in no part: pauses and moments between parts. */
  betweenSec: number;
  /** Whether every part knows when it began — the pauses are placed. */
  timed: boolean;
  points: ReportPoint[];
  /** The point furthest behind the programme, or null when never behind. */
  peak: ReportPoint | null;
  sections: ReportSectionSum[];
  counsel: { count: number; averageSec: number | null; plannedSec: number };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * The report. `sectionOf` and `counselPlannedOf` come from the programme
 * (lib/parts.ts, lib/run-order.ts); a part the programme no longer has is
 * counted with the opening, and its counsel minute is guessed from whether
 * a counsel was given.
 */
export function buildReport(input: {
  segments: ReportSegmentIn[];
  totalSec: number;
  plannedSec: number;
  sectionOf: (key: string) => ReportSection;
  counselPlannedOf: (key: string) => number | null;
}): ConductReport {
  const { segments, totalSec, plannedSec } = input;
  const timed = segments.length > 0 && segments.every((s) => isNum(s.startSec));

  let cursor = 0;
  const rows: ReportRow[] = segments.map((s, i) => {
    const known = input.counselPlannedOf(s.key);
    const counselPlannedSec = known ?? (s.counselSec != null ? 60 : 0);
    const devSec = s.actualSec - s.plannedSec;
    const counselDevSec = s.counselSec != null ? s.counselSec - counselPlannedSec : null;
    let pauseAfterSec: number | null = null;
    if (timed) {
      const end = (s.startSec as number) + s.actualSec + (s.counselSec ?? 0);
      const nextStart = i + 1 < segments.length ? (segments[i + 1].startSec as number) : totalSec;
      pauseAfterSec = Math.max(0, nextStart - end);
    }
    const fromX = timed ? (s.startSec as number) : cursor;
    const toX = fromX + s.actualSec + (s.counselSec ?? 0);
    cursor = toX;
    return {
      fromX,
      toX,
      index: i,
      key: s.key,
      section: input.sectionOf(s.key),
      plannedSec: s.plannedSec,
      actualSec: s.actualSec,
      devSec,
      counselPlannedSec,
      counselSec: s.counselSec,
      counselDevSec,
      pauseAfterSec,
      weightSec: devSec + (counselDevSec ?? 0),
    };
  });

  const inParts = rows.reduce((sum, r) => sum + r.actualSec + (r.counselSec ?? 0), 0);
  const betweenSec = Math.max(0, totalSec - inParts);

  // THE CURVE: how far behind the programme the meeting was, after each part
  // (and, when timed, after each pause). The programme's clock counts a
  // part with its counsel minute; the meeting's counts what really passed.
  const points: ReportPoint[] = [{ x: 0, y: 0, index: -1, pause: false }];
  let planCum = 0;
  let actCum = 0;
  rows.forEach((r, i) => {
    const s = segments[i];
    planCum += r.plannedSec + r.counselPlannedSec;
    if (timed) {
      const start = s.startSec as number;
      // The stretch before this part began, if any, was a pause.
      const last = points[points.length - 1];
      if (start - last.x >= 1) {
        points.push({ x: start, y: start - (planCum - r.plannedSec - r.counselPlannedSec), index: i - 1, pause: true });
      }
      const end = start + r.actualSec + (r.counselSec ?? 0);
      points.push({ x: end, y: end - planCum, index: i, pause: false });
    } else {
      actCum += r.actualSec + (r.counselSec ?? 0);
      points.push({ x: actCum, y: actCum - planCum, index: i, pause: false });
    }
  });
  if (timed) {
    // After the last part, up to the end of the meeting — the closing pause.
    const last = points[points.length - 1];
    if (totalSec - last.x >= 1) {
      points.push({ x: totalSec, y: totalSec - planCum, index: rows.length - 1, pause: true });
    }
  }

  let peak: ReportPoint | null = null;
  for (const p of points) if (p.y > 0 && (!peak || p.y > peak.y)) peak = p;

  const order: ReportSection[] = ['treasures', 'apply_yourself', 'christian_life'];
  const sections = order
    .map((section) => {
      const in_ = rows.filter((r) => r.section === section);
      return {
        section,
        plannedSec: in_.reduce((a, r) => a + r.plannedSec + r.counselPlannedSec, 0),
        actualSec: in_.reduce((a, r) => a + r.actualSec + (r.counselSec ?? 0), 0),
      };
    })
    .filter((x) => x.plannedSec > 0 || x.actualSec > 0);

  const given = rows.filter((r) => r.counselSec != null);
  const counselTotal = given.reduce((a, r) => a + (r.counselSec as number), 0);

  return {
    rows,
    totalSec,
    plannedSec,
    overSec: totalSec - plannedSec,
    betweenSec,
    timed,
    points,
    peak,
    sections,
    counsel: {
      count: given.length,
      averageSec: given.length ? counselTotal / given.length : null,
      plannedSec: 60,
    },
  };
}

/** The rows by how far each went from the programme, the furthest first; ties keep the programme's order. */
export function rowsByDeviation(rows: ReportRow[]): ReportRow[] {
  return [...rows].sort((a, b) => Math.abs(b.weightSec) - Math.abs(a.weightSec) || a.index - b.index);
}
