/**
 * WHAT A PHONE KEEPS FOR A HALL WITH NO SIGNAL — and what it never keeps.
 *
 * Until 8 October 2026 nothing the server said outlived the app: close it,
 * open it again in a hall with no signal, and «Мои назначения» read
 * «Назначений на ближайшие недели нет» — to a brother who was the chairman
 * that evening. The programme was an empty feed without a word of why.
 *
 * Now the last good answer of a few requests is kept on the device, for the
 * person who received it, and shown — with the time it was received — when
 * the server cannot be asked. Only these, and nothing else:
 *
 *   • my assignments (partners by name only);
 *   • the programme, duties, cleaning and field service of the eight weeks
 *     from this Monday — the first piece of the feed and of «Главная»;
 *   • meeting times and special events;
 *   • names of people and of groups — what every publisher sees anyway.
 *
 * NEVER: anybody's phone, e-mail or address (one's own included — see
 * keptIdentity), reports, absences, the elders' tasks, the journal, anything
 * only an administrator sees. A key not named here is not kept: the list is
 * a door that opens only on purpose.
 *
 * Pure: no imports, so scripts/check-offline-keep.mjs can run it as it is.
 */

/** How long a kept answer may be shown at all. */
export const KEEP_DAYS = 30;

/** Programme-like ranges that are kept — and only from this Monday. */
const RANGE_KINDS = ['assignments', 'duties', 'cleaning', 'field-service'];

/**
 * The name a query is kept under, or null for «never kept».
 *
 * `mondayISO` is the Monday of the current week: a range is kept only when it
 * starts there — the piece that «Главная» and the feed ask for first. Another
 * week's piece would never be asked for again under its key, so it would only
 * take room.
 */
export function keptName(queryKey: readonly unknown[], mondayISO: string): string | null {
  const [a, b, c, d] = queryKey;
  if (a === 'me' && b === 'assignments' && queryKey.length === 2) return 'me/assignments';
  if (a === 'meeting-settings' && queryKey.length === 1) return 'meeting-settings';
  if (a === 'special-events') {
    if (queryKey.length === 1) return 'special-events';
    if (queryKey.length === 2 && (b === 'home' || b === 'all')) return `special-events/${b}`;
    return null;
  }
  if (a === 'publishers' && b === 'roster' && queryKey.length === 2) return 'publishers/roster';
  if (a === 'service-groups' && queryKey.length === 1) return 'service-groups';
  if (typeof a === 'string' && RANGE_KINDS.includes(a) && b === 'range' && c === mondayISO) {
    if (queryKey.length === 3) return `${a}/${c}`;
    if (queryKey.length === 4 && typeof d === 'string') return `${a}/${c}/${d}`;
  }
  return null;
}

export interface KeptEntry {
  key: readonly unknown[];
  data: unknown;
  /** When the server gave this answer (ms). */
  at: number;
}

/**
 * What stays of what was kept: nothing older than KEEP_DAYS, and no range
 * that does not start this Monday (last week's piece is never asked for).
 */
export function pruneKept(
  entries: Record<string, KeptEntry>,
  nowMs: number,
  mondayISO: string,
): Record<string, KeptEntry> {
  const out: Record<string, KeptEntry> = {};
  for (const [name, e] of Object.entries(entries)) {
    if (!e || !Array.isArray(e.key) || typeof e.at !== 'number') continue;
    if (nowMs - e.at > KEEP_DAYS * 86_400_000 || e.at > nowMs + 86_400_000) continue;
    if (keptName(e.key, mondayISO) !== name) continue;
    out[name] = e;
  }
  return out;
}

/** The fields of one's own card that are kept: who and which group — no contacts. */
export interface KeptIdentity {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  pioneerType: string | null;
  appointment: string | null;
  serviceGroupId: string | null;
}

export function keptIdentity(p: unknown): KeptIdentity | null {
  if (!p || typeof p !== 'object') return null;
  const x = p as Record<string, unknown>;
  if (typeof x.id !== 'string') return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const n = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: x.id,
    displayName: s(x.displayName),
    firstName: s(x.firstName),
    lastName: s(x.lastName),
    pioneerType: n(x.pioneerType),
    appointment: n(x.appointment),
    serviceGroupId: n(x.serviceGroupId),
  };
}

/** Monday of the week of `d`, as YYYY-MM-DD in local time. */
export function mondayOf(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  const p = (v: number) => String(v).padStart(2, '0');
  return `${m.getFullYear()}-${p(m.getMonth() + 1)}-${p(m.getDate())}`;
}

/**
 * One meeting's programme, from what is kept (9 October 2026).
 *
 * «Ведение встречи» asks the server for its week alone, under a key that is
 * never kept. In a hall with no signal the chairman then had nothing — while
 * the same rows lay on the device in the programme kept for the eight weeks
 * from this Monday. Of the kept pieces that hold this meeting, the most
 * recent answer wins.
 */
export function keptMeetingRows<T extends { weekStartDate: string; eventType: string; deletedAt: string | null }>(
  pieces: { rows: readonly T[]; at: number }[],
  week: string,
  eventType: string,
): { rows: T[]; at: number } | null {
  let best: { rows: T[]; at: number } | null = null;
  for (const p of pieces) {
    const rows = p.rows.filter((r) => r.weekStartDate === week && r.eventType === eventType && !r.deletedAt);
    if (rows.length > 0 && (!best || p.at > best.at)) best = { rows, at: p.at };
  }
  return best;
}
