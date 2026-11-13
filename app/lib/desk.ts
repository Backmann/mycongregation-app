/**
 * «Выдача и приём» (13 November 2026; mockup «Выдача и приём»): the
 * territory servant's desk, from the person to the territories. Pure — no
 * imports — so the gate can check it (scripts/check-desk.mjs).
 */

export interface DeskOut {
  assignmentId: string;
  territoryId: string;
  number: string;
  locality: string | null;
  publisherId: string | null;
  holderName: string;
  forGroupId: string | null;
  forGroupName: string | null;
  assignedOn: string;
  dueOn: string | null;
  extended: boolean;
  paperWanted: boolean;
}

export interface DeskPerson {
  publisherId: string;
  name: string;
  pioneer: boolean;
  serviceGroupId: string | null;
  hasApp: boolean;
}

export interface DeskHistory {
  publisherId: string;
  territoryId: string;
  assignedOn: string;
  completedOn: string | null;
  returnedOn: string | null;
}

/** Someone at the desk: a card, or a holder brought over without one. */
export interface DeskEntry {
  key: string;
  publisherId: string | null;
  name: string;
  hasApp: boolean;
  pioneer: boolean;
  serviceGroupId: string | null;
  holds: DeskOut[];
  /** Days past the day of his most overdue territory; 0 when none. */
  late: number;
  /** Days left to his nearest day, when none is past; null: nothing due. */
  left: number | null;
}

/** Within this many days the day «is near» (the holder is told then too). */
export const SOON_DAYS = 14;

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Lower case, accents and ё folded: «Jörg» is found as «jorg». */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // cyrillic-ok: «ё» is searched as «е»; a rule about letters, not words.
    .replace(/ё/g, 'е')
    .toLowerCase()
    .trim();
}

/** Everyone at the desk: the people one may give to, and the holders. */
export function entriesOf(
  people: DeskPerson[],
  out: DeskOut[],
  today: string,
): DeskEntry[] {
  const entries = new Map<string, DeskEntry>();
  for (const p of people) {
    entries.set(p.publisherId, {
      key: p.publisherId,
      publisherId: p.publisherId,
      name: p.name,
      hasApp: p.hasApp,
      pioneer: p.pioneer,
      serviceGroupId: p.serviceGroupId,
      holds: [],
      late: 0,
      left: null,
    });
  }
  for (const o of out) {
    const key = o.publisherId ?? `name:${fold(o.holderName)}`;
    let e = entries.get(key);
    if (!e) {
      // A holder brought over without a card, or one no longer offered
      // (inactive): still at the desk with what he holds.
      e = {
        key,
        publisherId: o.publisherId,
        name: o.holderName,
        hasApp: false,
        pioneer: false,
        serviceGroupId: null,
        holds: [],
        late: 0,
        left: null,
      };
      entries.set(key, e);
    }
    e.holds.push(o);
  }
  for (const e of entries.values()) {
    e.holds.sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'));
    for (const h of e.holds) {
      if (!h.dueOn) continue;
      const d = daysBetween(today, h.dueOn);
      if (d < 0) e.late = Math.max(e.late, -d);
      else if (e.left === null || d < e.left) e.left = d;
    }
  }
  return [...entries.values()];
}

/** Whom to go up to today: the days past, then the days near. */
export function attentionOf(entries: DeskEntry[]): { late: DeskEntry[]; soon: DeskEntry[] } {
  return {
    late: entries.filter((e) => e.late > 0).sort((a, b) => b.late - a.late || a.name.localeCompare(b.name)),
    soon: entries
      .filter((e) => e.late === 0 && e.left !== null && e.left <= SOON_DAYS)
      .sort((a, b) => (a.left as number) - (b.left as number) || a.name.localeCompare(b.name)),
  };
}

/** By name (any part, accents folded) or by a territory he holds. */
export function searchDesk(entries: DeskEntry[], query: string): DeskEntry[] {
  const q = fold(query);
  if (!q) return [];
  const parts = q.split(/\s+/);
  return entries
    .filter((e) => {
      const name = fold(e.name);
      if (parts.every((p) => name.includes(p))) return true;
      return e.holds.some((h) => fold(h.number).startsWith(q));
    })
    .sort((a, b) => b.holds.length - a.holds.length || a.name.localeCompare(b.name));
}

export interface FreeRow {
  id: string;
  number: string;
  locality: string | null;
  category?: string;
  lastCompletedOn: string | null;
  holder: unknown | null;
}

export interface FreeChoice<T extends FreeRow> {
  row: T;
  houses: number | null;
  noCalls: number;
  /** He had it in the years kept: the day it was given to him. */
  hadOn: string | null;
  /** Not worked for a year or more (or never): give these first. */
  longAgo: boolean;
}

/**
 * The free territories to give him, of the kind asked: never worked first,
 * then the longest ago; one he had lately is marked, not hidden — the
 * servant decides.
 */
export function freeFor<T extends FreeRow>(
  rows: T[],
  opts: {
    publisherId: string | null;
    history: DeskHistory[];
    houses: Record<string, number> | null;
    noCalls: Record<string, number>;
    today: string;
    category?: string;
  },
): FreeChoice<T>[] {
  const cat = opts.category ?? 'residential';
  return rows
    .filter((r) => !r.holder && (r.category ?? 'residential') === cat)
    .sort(
      (a, b) =>
        (a.lastCompletedOn ?? '').localeCompare(b.lastCompletedOn ?? '') ||
        a.number.localeCompare(b.number, undefined, { numeric: true }),
    )
    .map((row) => {
      const mine = opts.publisherId
        ? opts.history
            .filter((h) => h.publisherId === opts.publisherId && h.territoryId === row.id)
            .map((h) => h.assignedOn)
            .sort()
        : [];
      return {
        row,
        houses: opts.houses ? opts.houses[row.id] ?? 0 : null,
        noCalls: opts.noCalls[row.id] ?? 0,
        hadOn: mine.length ? mine[mine.length - 1] : null,
        longAgo: !row.lastCompletedOn || daysBetween(row.lastCompletedOn, opts.today) >= 365,
      };
    });
}

/** His service year in figures: worked, back without working, days each. */
export function yearOf(
  history: DeskHistory[],
  publisherId: string,
  today: string,
): { worked: number; returned: number; avgDays: number | null } {
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 9 ? `${y}-09-01` : `${y - 1}-09-01`;
  const mine = history.filter((h) => h.publisherId === publisherId);
  const worked = mine.filter((h) => h.completedOn && h.completedOn >= start);
  const returned = mine.filter((h) => h.returnedOn && h.returnedOn >= start);
  const days = worked.map((h) => daysBetween(h.assignedOn, h.completedOn as string));
  return {
    worked: worked.length,
    returned: returned.length,
    avgDays: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
  };
}
