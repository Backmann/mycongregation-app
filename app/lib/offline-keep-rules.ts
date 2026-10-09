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

/** YYYY-MM-DD plus whole days, in local time. */
function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/**
 * The weeks a kept range covers: [from, to). «Главная»'s field-service key
 * has no end of its own — it asks for three weeks.
 */
export function rangeSpan(key: readonly unknown[]): { kind: string; from: string; to: string } | null {
  const [kind, b, from, to] = key;
  if (typeof kind !== 'string' || !RANGE_KINDS.includes(kind) || b !== 'range' || typeof from !== 'string') return null;
  if (key.length === 4 && typeof to === 'string') return { kind, from, to };
  if (key.length === 3) return { kind, from, to: plusDays(from, 21) };
  return null;
}

/**
 * What stays of what was kept: nothing older than KEEP_DAYS — and a range
 * only while it still covers this week or a later one.
 *
 * Until 9 October a range was wiped the first Monday after it was kept, with
 * seven of its eight weeks still ahead: a brother last online on Sunday had
 * no programme in a hall with no signal on Wednesday.
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
    const span = rangeSpan(e.key);
    if (span) {
      // Kept under the name it was given on its own Monday; still ahead of us.
      if (keptName(e.key, span.from) !== name) continue;
      if (span.from > mondayISO || span.to <= mondayISO) continue;
    } else if (keptName(e.key, mondayISO) !== name) {
      continue;
    }
    out[name] = e;
  }
  // At most ONE earlier piece of each range besides this Monday's: a brother
  // online every week would otherwise gather up to eight eight-week pieces
  // of each — about 1.6 MB on a real congregation (measured 9 October on the
  // anonymised copy: 205 KB a week) — and past the limit nothing is written
  // at all. The newest earlier piece is the one that can be wanted.
  const newestEarlier = new Map<string, string>();
  for (const [name, e] of Object.entries(out)) {
    const span = rangeSpan(e.key);
    if (!span || span.from >= mondayISO) continue;
    const group = `${span.kind}/${e.key.length}`;
    const held = newestEarlier.get(group);
    if (!held || out[held].at < e.at) newestEarlier.set(group, name);
  }
  for (const [name, e] of Object.entries(out)) {
    const span = rangeSpan(e.key);
    if (!span || span.from >= mondayISO) continue;
    if (newestEarlier.get(`${span.kind}/${e.key.length}`) !== name) delete out[name];
  }
  return out;
}

/**
 * The rows of the weeks [from, to) taken from EARLIER kept pieces — for a
 * screen whose own request (this Monday's piece) did not come.
 *
 * Week by week, the most recent piece that covers the week answers for it
 * («Главная» keeps three weeks of field service, the feed eight: the newer
 * short piece must not cut the older long one short). `at` is the OLDEST
 * answer used — the line «показано то, что пришло …» must not make the
 * programme look newer than it is. `coveredTo` is where knowledge ends:
 * past it a screen must not say «the programme ends here».
 */
export function rowsFromEarlierPiece<T extends { weekStartDate: string }>(
  pieces: { from: string; to: string; rows: readonly T[]; at: number }[],
  from: string,
  to: string,
): { rows: T[]; at: number; coveredTo: string } | null {
  const usable = pieces.filter((p) => p.from < from && p.to > from).sort((a, b) => b.at - a.at);
  if (usable.length === 0) return null;
  const claimed = new Set<string>();
  const rows: T[] = [];
  let at = Infinity;
  let coveredTo = from;
  for (const p of usable) {
    const end = p.to < to ? p.to : to;
    let used = false;
    for (let w = from; w < end; w = plusDays(w, 7)) {
      if (claimed.has(w)) continue;
      claimed.add(w);
      used = true;
      for (const r of p.rows) if (r.weekStartDate === w) rows.push(r);
    }
    if (used) at = Math.min(at, p.at);
    if (end > coveredTo) coveredTo = end;
  }
  return { rows, at, coveredTo };
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
