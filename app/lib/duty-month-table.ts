import type { TFunction } from 'i18next';
import type { MonthDutyMeeting, MonthDutyRow } from './api';
import { rowKeysOf } from './duty-autofill';
import { dutyLabel } from '../components/DutiesSection';

/**
 * The month as a table — places by meetings. ONE builder for the screen and
 * for the sheet printed for the notice board (27 October 2026), so the two
 * cannot list the places differently: the printed sheet used to group its
 * own places by slot number and mixed «Стоянка» with «Гардероб».
 */
export interface MonthTable {
  rows: { key: string; sort: number; ordinal: number; row: MonthDutyRow }[];
  /** Per meeting (same index): row key → that meeting's row there. */
  cells: Map<string, { row: MonthDutyRow; ordinal: number }>[];
  /** How many rows each place has — «Стоянка» or «Стоянка 1», «Стоянка 2». */
  placeCount: Map<string, number>;
}

export function monthTable(meetings: MonthDutyMeeting[]): MonthTable {
  const order = new Map<string, { sort: number; ordinal: number; row: MonthDutyRow }>();
  const cells = meetings.map((m) => {
    const map = new Map<string, { row: MonthDutyRow; ordinal: number }>();
    for (const r of rowKeysOf(m)) {
      map.set(r.key, { row: r.row, ordinal: r.ordinal });
      const was = order.get(r.key);
      if (!was || r.row.sortOrder < was.sort) order.set(r.key, { sort: r.row.sortOrder, ordinal: r.ordinal, row: r.row });
    }
    return map;
  });
  const rows = [...order.entries()]
    .sort((a, b) => a[1].sort - b[1].sort || a[1].ordinal - b[1].ordinal)
    .map(([key, v]) => ({ key, ...v }));
  const placeCount = new Map<string, number>();
  for (const r of rows) {
    const place = r.key.split('#')[0];
    placeCount.set(place, (placeCount.get(place) ?? 0) + 1);
  }
  return { rows, cells, placeCount };
}

/** «Микрофон 2», «Стоянка 1», «Сцена» — a row's name in the table. */
export function rowTitle(table: MonthTable, key: string, row: MonthDutyRow, ordinal: number, t: TFunction): string {
  const base = dutyLabel({ ...row, id: '', congregationId: '', weekStartDate: '', eventType: 'midweek' } as never, t);
  if (row.dutyType === 'microphone') return base;
  return (table.placeCount.get(key.split('#')[0]) ?? 1) > 1 ? `${base} ${ordinal + 1}` : base;
}
