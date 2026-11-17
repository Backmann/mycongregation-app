/**
 * A line of the S-13 entered or corrected by hand (17 November 2026): the
 * server's rules, said on the sheet before «Сохранить» rather than after
 * (territory-assignments.service: correctable / liesOver / addPast).
 *
 *  - names are kept for the current and the previous service year: a line
 *    from before the app may not start earlier, a correction may not touch
 *    a line that ended earlier;
 *  - two lines of a territory never lie over each other by days; a line may
 *    start the day the one before it ended; an open line runs on without end;
 *  - nothing in the future, nothing that ends before it starts.
 *
 * Pure, for scripts/check-territory-record.mjs.
 */

export interface RecordLine {
  id: string;
  holderName: string;
  assignedOn: string;
  completedOn: string | null;
  returnedOn: string | null;
}

export interface RecordDraft {
  assignedOn: string;
  /** Null: still in his hands. */
  endedOn: string | null;
}

export type RecordProblem<L extends RecordLine = RecordLine> =
  | { kind: 'future' }
  | { kind: 'endBeforeStart' }
  | { kind: 'tooOld' }
  | { kind: 'over'; with: L };

const FAR = '9999-12-31';

/** The start of the previous service year (1 September). */
export function keptFromOf(today: string): string {
  const y = Number(today.slice(0, 4));
  const startThis = today.slice(5) >= '09-01' ? y : y - 1;
  return `${startThis - 1}-09-01`;
}

/**
 * What stops the line from being saved, or null. `keptBy`: a new line from
 * paper is held to its start, a correction to its end — as on the server.
 */
export function recordProblem<L extends RecordLine>(
  d: RecordDraft,
  others: L[],
  today: string,
  keptFrom: string,
  keptBy: 'start' | 'end',
): RecordProblem<L> | null {
  if (!d.assignedOn) return null;
  if (d.assignedOn > today || (d.endedOn && d.endedOn > today)) return { kind: 'future' };
  if (d.endedOn && d.endedOn < d.assignedOn) return { kind: 'endBeforeStart' };
  if (keptBy === 'start' ? d.assignedOn < keptFrom : !!d.endedOn && d.endedOn < keptFrom) {
    return { kind: 'tooOld' };
  }
  const to = d.endedOn ?? FAR;
  const hit = others.find((o) => {
    const oEnd = o.completedOn ?? o.returnedOn ?? FAR;
    return o.assignedOn < to && oEnd > d.assignedOn;
  });
  return hit ? { kind: 'over', with: hit } : null;
}

/** The lines just before and after this one, in time. */
export function neighboursOf<L extends RecordLine>(
  row: L,
  rows: L[],
): { before: L | null; after: L | null } {
  const sorted = [...rows].sort((a, b) =>
    a.assignedOn === b.assignedOn ? 0 : a.assignedOn < b.assignedOn ? -1 : 1,
  );
  const i = sorted.findIndex((r) => r.id === row.id);
  return { before: i > 0 ? sorted[i - 1] : null, after: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null };
}

/**
 * The day a territory handed on is due (review of 17 November 2026): the
 * day it was due if that is still after the handing-on day and the keeper
 * keeps it; otherwise four months from that day. `send` is what goes to the
 * server — the server keeps the old day when none is sent, so a day that
 * differs from it must always be sent (an overdue territory used to be
 * refused with «keep» shown as a new day).
 */
export function transferDue(
  currentDue: string | null,
  on: string,
  fresh: boolean,
  addDays: (iso: string, n: number) => string,
  termDays: number,
): { keep: string | null; dueOn: string; send: string | undefined } {
  const keep = currentDue && currentDue > on ? currentDue : null;
  const dueOn = fresh || !keep ? addDays(on, termDays) : keep;
  return { keep, dueOn, send: dueOn !== currentDue ? dueOn : undefined };
}
