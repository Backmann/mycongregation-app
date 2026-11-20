/**
 * «Учебные на месяц» (step 4б, 20 November 2026). Guidelines п. 24: as soon
 * as the workbook is out, plan its student parts as a whole. One table —
 * rows are the student parts (№3 Bible reading, №4… the ministry parts),
 * columns the weeks — and in each cell what the person who builds the
 * programme must not miss: the same pair again, the same person two weeks
 * running. Pure; the gate holds it to examples (scripts/check-student-month.mjs).
 */
import { ministryKind } from './meeting-guidelines';
import { isStudentItem, PAIR_BACK_WEEKS, weeksBetween, type RankItem } from './picker-rank';

export interface MonthRow {
  id: string;
  weekStartDate: string;
  eventType: string;
  partKey: string;
  partTitle: string | null;
  publisherId: string | null;
  assistantPublisherId: string | null;
  status: string;
}

export type CellFlag =
  /** Lead and assistant were a pair before (week of the last time). */
  | { kind: 'pairBefore'; week: string }
  /** This person has a student part the week before or after too. */
  | { kind: 'twoInRow'; personId: string };

export interface MonthCell {
  row: MonthRow;
  /** A discussion is given to an elder or a servant — no student checks. */
  student: boolean;
  empty: boolean;
  flags: CellFlag[];
}

export interface MonthLine {
  partKey: string;
  /** №3 for the Bible reading, №4… for the ministry parts. */
  number: number;
  cells: Map<string, MonthCell>;
}

export interface StudentMonth {
  weeks: string[];
  lines: MonthLine[];
}

const STUDENT_KEYS = /^(bible_reading|apply_yourself_\d+)$/;

/** №3 is the Bible reading; the ministry parts follow it in their order. */
export function partNumber(partKey: string): number {
  if (partKey === 'bible_reading') return 3;
  const n = Number(partKey.replace('apply_yourself_', ''));
  return Number.isFinite(n) ? 3 + n : 99;
}

/** «Начинайте разговор: Служение по домам…» → «Начинайте разговор». */
export function partHeading(title: string | null | undefined): string {
  const t = (title ?? '').trim();
  const cut = t.search(/[:.]/);
  return (cut > 0 ? t.slice(0, cut) : t).trim();
}

/**
 * The table for `weeks`. `itemsOf` is the history of a person (as the pickers
 * read it: 26 weeks back and the planned weeks ahead), so a pair from before
 * the table is still told.
 */
export function studentMonth(
  weeks: readonly string[],
  rows: readonly MonthRow[],
  itemsOf: (id: string) => readonly RankItem[],
): StudentMonth {
  const inWeeks = new Set(weeks);
  const live = rows.filter(
    (r) =>
      r.eventType === 'midweek' &&
      STUDENT_KEYS.test(r.partKey) &&
      r.status !== 'cancelled' &&
      inWeeks.has(r.weekStartDate.slice(0, 10)),
  );
  const keys = [...new Set(live.map((r) => r.partKey))].sort(
    (a, b) => partNumber(a) - partNumber(b),
  );
  const lines: MonthLine[] = keys.map((partKey) => {
    const cells = new Map<string, MonthCell>();
    for (const r of live.filter((x) => x.partKey === partKey)) {
      const week = r.weekStartDate.slice(0, 10);
      const student =
        r.partKey === 'bible_reading' || ministryKind(r.partTitle) !== 'discussion';
      const flags: CellFlag[] = [];
      if (student) {
        const pair = r.publisherId && r.assistantPublisherId ? pairBefore(r, week, itemsOf) : null;
        if (pair) flags.push({ kind: 'pairBefore', week: pair });
        for (const id of [r.publisherId, r.assistantPublisherId]) {
          if (id && besideWeek(id, r.id, week, itemsOf)) flags.push({ kind: 'twoInRow', personId: id });
        }
      }
      cells.set(week, {
        row: r,
        student,
        empty: !r.publisherId && !r.assistantPublisherId,
        flags,
      });
    }
    return { partKey, number: partNumber(partKey), cells };
  });
  return { weeks: [...weeks], lines };
}

/** The last week before `week` (within 26) the same two were a pair. */
function pairBefore(
  r: MonthRow,
  week: string,
  itemsOf: (id: string) => readonly RankItem[],
): string | null {
  let last: string | null = null;
  for (const it of itemsOf(r.publisherId!)) {
    if (it.kind !== 'part' || it.assignmentId === r.id) continue;
    if (it.partnerId !== r.assistantPublisherId) continue;
    const ago = weeksBetween(it.weekStartDate, week);
    if (ago <= 0 || ago > PAIR_BACK_WEEKS) continue;
    if (!last || it.weekStartDate > last) last = it.weekStartDate.slice(0, 10);
  }
  return last;
}

/** A student part of this person in the week before or after, another part. */
function besideWeek(
  id: string,
  partId: string,
  week: string,
  itemsOf: (id: string) => readonly RankItem[],
): boolean {
  return itemsOf(id).some(
    (it) =>
      it.assignmentId !== partId &&
      isStudentItem(it) &&
      Math.abs(weeksBetween(week, it.weekStartDate)) === 1,
  );
}
