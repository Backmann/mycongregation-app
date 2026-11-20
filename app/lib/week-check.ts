/**
 * «Проверка недели» (mockup «Составление программы — вариант В», 20 November
 * 2026): everything in the week that asks for a look, in one place — and the
 * guidelines' own limits: a student part is given at least three weeks
 * ahead (п. 24), the meeting lasts no longer than 1 h 45 min (п. 20).
 *
 * Pure: the screen hands over the week's parts, what the server counts as
 * missing (the same count as the «N из M» badge), the meeting days, today,
 * who is away, each person's history and the meeting's minutes; this returns
 * the lines. The gate (scripts/check-week-check.mjs) holds it to examples.
 */
import { isStudentItem, weeksBetween, PAIR_AHEAD_WEEKS, PAIR_BACK_WEEKS, type RankItem } from './picker-rank';

export interface CheckRow {
  id: string;
  eventType: 'midweek' | 'weekend';
  partKey: string;
  partTitle: string | null;
  publisherId: string | null;
  assistantPublisherId: string | null;
  status: string;
  /** Weeks start on Monday, ISO. */
  weekStartDate: string;
}

/** Days before the meeting by which a student part must be given (п. 24). */
export const GIVE_AHEAD_DAYS = 21;
/** The whole meeting with songs and prayers, at most (п. 20). */
export const MAX_MIDWEEK_MINUTES = 105;

export type CheckLine =
  | { kind: 'late'; row: CheckRow; days: number }
  | { kind: 'empty'; row: CheckRow }
  | { kind: 'away'; row: CheckRow; personId: string; rows: CheckRow[] }
  | { kind: 'emptyMany'; row: CheckRow; eventType: 'midweek' | 'weekend'; count: number }
  | { kind: 'unsent'; row: CheckRow; days: number }
  | { kind: 'pair'; row: CheckRow; week: string }
  | { kind: 'long'; minutes: number }
  | { kind: 'double'; eventType: 'midweek' | 'weekend'; personId: string; rows: CheckRow[] };

export interface CheckInput {
  rows: CheckRow[];
  /** Part keys still without a person, per meeting — the server's count. */
  missing: { midweek: readonly string[]; weekend: readonly string[] };
  dates: { midweek: string | null; weekend: string | null };
  today: string;
  absent: { midweek: ReadonlySet<string>; weekend: ReadonlySet<string> };
  itemsOf: (id: string) => readonly RankItem[];
  midweekMinutes: number | null;
}

const DAY = 86400000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY);

const asItem = (r: CheckRow): RankItem => ({
  weekStartDate: r.weekStartDate,
  eventType: r.eventType,
  kind: 'part',
  partKey: r.partKey,
  partTitle: r.partTitle,
});

/** More empty parts than this in a meeting: one line for them all. */
export const EMPTY_LINES_MAX = 3;

const ORDER: CheckLine['kind'][] = ['late', 'emptyMany', 'empty', 'away', 'unsent', 'pair', 'long', 'double'];

export function checkWeek(input: CheckInput): CheckLine[] {
  const out: CheckLine[] = [];
  const live = input.rows.filter((r) => r.status !== 'cancelled');
  for (const kind of ['midweek', 'weekend'] as const) {
    const rows = live.filter((r) => r.eventType === kind);
    const date = input.dates[kind];
    const left = date ? days(input.today, date) : null;
    const soon = left !== null && left >= 0 && left <= GIVE_AHEAD_DAYS;
    // Missing: the server's list, matched to rows one by one.
    const taken = new Set<string>();
    const empty: CheckRow[] = [];
    for (const key of input.missing[kind]) {
      const row = rows.find((r) => r.partKey === key && !taken.has(r.id) && !r.publisherId);
      if (!row) continue;
      taken.add(row.id);
      // A student part closer than three weeks is told on its own, always.
      if (soon && isStudentItem(asItem(row))) out.push({ kind: 'late', row, days: left! });
      else empty.push(row);
    }
    // A meeting just loaded is empty all through: one line, not twenty.
    if (empty.length > EMPTY_LINES_MAX)
      out.push({ kind: 'emptyMany', row: empty[0], eventType: kind, count: empty.length });
    else for (const row of empty) out.push({ kind: 'empty', row });
    // One line per person away, with all his parts.
    const awayRows = new Map<string, CheckRow[]>();
    for (const r of rows)
      for (const id of [r.publisherId, r.assistantPublisherId])
        if (id && input.absent[kind].has(id)) {
          const list = awayRows.get(id) ?? [];
          if (!list.includes(r)) list.push(r);
          awayRows.set(id, list);
        }
    for (const [personId, list] of awayRows) out.push({ kind: 'away', row: list[0], personId, rows: list });
    for (const r of rows) {
      if (soon && r.publisherId && r.status === 'draft' && isStudentItem(asItem(r)))
        out.push({ kind: 'unsent', row: r, days: left! });
      if (r.publisherId && r.assistantPublisherId && isStudentItem(asItem(r))) {
        const pair = input
          .itemsOf(r.publisherId)
          .filter((it) => it.partnerId === r.assistantPublisherId && it.assignmentId !== r.id && isStudentItem(it))
          .map((it) => ({ it, w: weeksBetween(r.weekStartDate, it.weekStartDate) }))
          .filter(({ w }) => w >= -PAIR_BACK_WEEKS && w <= PAIR_AHEAD_WEEKS)
          .sort((a, b) => Math.abs(a.w) - Math.abs(b.w))[0];
        if (pair) out.push({ kind: 'pair', row: r, week: pair.it.weekStartDate.slice(0, 10) });
      }
    }
    // One person on more than one part of the meeting — told, not a fault.
    const byPerson = new Map<string, CheckRow[]>();
    for (const r of rows)
      for (const id of [r.publisherId, r.assistantPublisherId]) {
        if (!id) continue;
        const list = byPerson.get(id) ?? [];
        if (!list.includes(r)) list.push(r);
        byPerson.set(id, list);
      }
    for (const [personId, list] of byPerson)
      if (list.length > 1) out.push({ kind: 'double', eventType: kind, personId, rows: list });
  }
  if (input.midweekMinutes !== null && input.midweekMinutes > MAX_MIDWEEK_MINUTES)
    out.push({ kind: 'long', minutes: input.midweekMinutes });
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
