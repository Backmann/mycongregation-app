/**
 * «Изменено» on Home (9 November 2026, Lionel's choice «б»): what changed in
 * the person's own coming assignments since they last saw Home — on any
 * device. The server keeps what Home showed (GET /me/agenda/changes,
 * POST /me/agenda/seen); this file ties its answer to Home's rows.
 *
 * A row knows its assignments by `agendaId` (server: the agenda row's id, or
 * its first part — `part:<id>` stands for `part:<id>:assistant` too,
 * `cart:<day>` for each shift of that day). The server's change carries the
 * full id, so a row owns a change when the ids are equal or the change's id
 * goes on after the row's with «:».
 *
 * Pure: no React, no translations — scripts/check-home-changes.mjs runs it.
 */
import type { TimelineEntry } from './home-timeline';

/** What of an assignment counts as a change worth a mark. */
export type ChangedField = 'date' | 'start' | 'title' | 'with' | 'place';

export interface AgendaChange {
  id: string;
  kind: 'new' | 'changed';
  fields: ChangedField[];
  before: {
    date: string;
    start: string | null;
    title: string;
    with: string[];
    place: string | null;
  } | null;
}

export interface AgendaRemoval {
  id: string;
  date: string;
  start: string | null;
  title: string;
}

export interface AgendaChanges {
  /** Nothing seen before: no marks at all. */
  first: boolean;
  changes: AgendaChange[];
  removed: AgendaRemoval[];
}

/** Does the row's id (its assignment's agendaId) own this change's id? */
export function owns(agendaId: string, changeId: string): boolean {
  return changeId === agendaId || changeId.startsWith(`${agendaId}:`);
}

/** The changes a row with these assignments owns — changed ones first. */
export function changesFor(
  agendaIds: (string | null | undefined)[],
  all: AgendaChanges | null | undefined,
): AgendaChange[] {
  if (!all || all.first) return [];
  const ids = agendaIds.filter((x): x is string => !!x);
  if (ids.length === 0) return [];
  const mine = all.changes.filter((c) => ids.some((id) => owns(id, c.id)));
  return [
    ...mine.filter((c) => c.kind === 'changed'),
    ...mine.filter((c) => c.kind === 'new'),
  ];
}

/**
 * What a changed assignment was, in pieces for the line «было: …» — only
 * what changed. A moved day keeps its hour beside it («ср, 11 ноября ·
 * 19:00»); an hour moved on the same day is just the hour («09:00»).
 */
export interface BeforeBits {
  /** The old day, when the day changed. */
  date: string | null;
  /** The old hour, when the day or the hour changed, if it had one. */
  start: string | null;
  title: string | null;
  /** The old partners; empty — there was nobody. Null — unchanged. */
  with: string[] | null;
  /** The old place; '' — there was none. Null — unchanged. */
  place: string | null;
}

export function beforeBits(c: AgendaChange): BeforeBits | null {
  if (c.kind !== 'changed' || !c.before) return null;
  const f = new Set(c.fields);
  const when = f.has('date') || f.has('start');
  return {
    date: f.has('date') ? c.before.date : null,
    start: when ? c.before.start : null,
    title: f.has('title') ? c.before.title : null,
    with: f.has('with') ? c.before.with : null,
    place: f.has('place') ? (c.before.place ?? '') : null,
  };
}

/** Removals still ahead, nearest first — a past one is no news any more. */
export function removedAhead(
  all: AgendaChanges | null | undefined,
  todayISO: string,
): AgendaRemoval[] {
  if (!all || all.first) return [];
  return all.removed
    .filter((r) => r.date >= todayISO)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.start ?? '').localeCompare(b.start ?? ''),
    );
}

/** Changes no shown row owns — said as a count where the full list opens. */
export function unshownCount(
  all: AgendaChanges | null | undefined,
  shownIds: (string | null | undefined)[],
): number {
  if (!all || all.first) return 0;
  const ids = shownIds.filter((x): x is string => !!x);
  return all.changes.filter((c) => !ids.some((id) => owns(id, c.id))).length;
}

/** The person's own assignments a Home row draws, by their agenda id. */
export function entryAgendaIds(en: TimelineEntry): string[] {
  const ids =
    en.type === 'meeting'
      ? (en.agendaIds ?? [])
      : en.type === 'task'
        ? [en.task.item.agendaId]
        : en.type === 'outgoing_talk'
          ? en.talks.map((r) => r.item.agendaId)
          : [];
  return ids.filter((x): x is string => !!x);
}
