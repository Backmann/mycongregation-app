import type { S21Totals, S21TotalsMonth } from './api';

/**
 * THE THREE TOTALS CARDS (S-21) — what the screen and the printed sheet share.
 *
 * Instruction, point 14: besides each person's card the secretary keeps three
 * with the congregation's total for every month — (1) regular, special
 * pioneers and missionaries in the field, (2) auxiliary pioneers, (3) all
 * other publishers. Lionel chose «план Б» (30 October 2026): a month stands as
 * it went to the branch, a late report in the month that counted it.
 */
export type TotalsCardKey = 'pioneers' | 'auxiliary' | 'publishers';

export interface TotalsCard {
  key: TotalsCardKey;
  /** The card's colour: the colour language's own for pioneers / publishers. */
  tone: string;
  /** Pale ground for the card's band. */
  soft: string;
  /** Publishers report no hours. */
  hasHours: boolean;
}

export const TOTALS_CARDS: TotalsCard[] = [
  { key: 'pioneers', tone: '#15803d', soft: '#f0fdf4', hasHours: true },
  { key: 'auxiliary', tone: '#0e7490', soft: '#ecfeff', hasHours: true },
  { key: 'publishers', tone: '#6d28d9', soft: '#f5f3ff', hasHours: false },
];

export interface TotalsRow {
  month: string;
  state: S21TotalsMonth['state'];
  /** Null where the month has nothing to show (not yet, or nothing kept). */
  count: number | null;
  hours: number | null;
  studies: number | null;
  /** Late reports of earlier months counted here. */
  late: number;
  /** Card 1 only: special pioneers and missionaries among the count. */
  direct: number;
}

/** A month with figures at all. */
export function hasFigures(state: S21TotalsMonth['state']): boolean {
  return state !== 'future' && state !== 'none';
}

export function rowsOf(data: S21Totals, card: TotalsCard): TotalsRow[] {
  return data.months.map((m) => {
    const shown = hasFigures(m.state);
    const line =
      card.key === 'pioneers'
        ? m.pioneers
        : card.key === 'auxiliary'
          ? m.auxiliary
          : m.publishers;
    return {
      month: m.month,
      state: m.state,
      count: shown ? line.count : null,
      hours:
        shown && card.hasHours
          ? ((line as { hours?: number }).hours ?? 0)
          : null,
      studies: shown ? line.studies : null,
      late: m.late[card.key],
      direct: card.key === 'pioneers' ? m.pioneers.directToBranch : 0,
    };
  });
}

/** The hours of the year on a card — what the S-21's «Итого» asks. */
export function totalHours(rows: TotalsRow[]): number {
  return rows.reduce((n, r) => n + (r.hours ?? 0), 0);
}
