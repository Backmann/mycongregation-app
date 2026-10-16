import type { ConductRunSegment } from '../lib/api';

/**
 * HOW THE MEETING RAN — the data of a result, and the two clocks it is told
 * in. The table that lived here (14 October 2026) gave way to the detailed
 * result, components/ConductReport.tsx (16 October 2026).
 */

export interface ConductSummaryData {
  segments: ConductRunSegment[];
  totalSec: number;
  plannedSec: number;
  /** When the first part began, ISO; null or absent in older results. */
  startedAt?: string | null;
}

/** m:ss */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 1:47:05, or 47:05 under an hour. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) return mmss(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
