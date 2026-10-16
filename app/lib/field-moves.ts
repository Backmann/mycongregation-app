/**
 * A MOVED MEETING SAYS SO ON BOTH DAYS (16 October 2026).
 *
 * A cancelled meeting stays in sight crossed out, so that nobody wonders
 * whether he missed it. A moved one used to leave its old day simply empty —
 * whoever missed the message saw a Saturday with nothing on it. Now the new
 * day carries «перенесена с сб 24 окт.» (the server keeps `movedFromDate`)
 * and the old day a stand-in: «перенесена на сб 31 окт.», crossed out.
 *
 * The stand-in is the same meeting with `movedTo` set, put on its old date,
 * and marked `cancelledAt` — so every count of meetings that HOLD, every «my
 * next meeting», every reminder leaves it out by the rule they already keep
 * for cancelled ones. Only the drawing tells the two apart (`movedTo`).
 *
 * Both marks last until the old day has passed: after it, nobody can still
 * turn up on the wrong day. Pure: no imports.
 */

interface Movable {
  id: string;
  weekStartDate: string;
  dayOfWeek: number;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  movedFromDate?: string | null;
  movedTo?: string;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of a date. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  return addDays(iso, 1 - dow);
}

/** The meeting's date. */
export function dateOfMeeting(m: { weekStartDate: string; dayOfWeek: number }): string {
  return addDays(m.weekStartDate.slice(0, 10), m.dayOfWeek - 1);
}

/** «Перенесена с …» is still worth saying: the old day has not passed. */
export function movedFromShown(m: Movable, todayISO: string): string | null {
  if (m.movedTo || m.cancelledAt || !m.movedFromDate) return null;
  return m.movedFromDate >= todayISO ? m.movedFromDate : null;
}

/**
 * The list with a stand-in on the old day of every meeting moved away from
 * it — when that day is still to come and lies in [fromISO, toISO). A list
 * that already holds stand-ins is returned unchanged in that respect.
 */
export function withMoveStandIns<T extends Movable>(
  list: readonly T[],
  todayISO: string,
  fromISO?: string,
  toISO?: string,
): T[] {
  const out: T[] = [...list];
  const hasStandIn = new Set(list.filter((m) => m.movedTo).map((m) => m.id));
  for (const m of list) {
    const from = m.movedFromDate;
    if (!from || m.movedTo || m.cancelledAt || hasStandIn.has(m.id)) continue;
    if (from < todayISO) continue;
    if (fromISO && from < fromISO) continue;
    if (toISO && from >= toISO) continue;
    const dow = new Date(`${from}T00:00:00Z`).getUTCDay() || 7;
    out.push({
      ...m,
      weekStartDate: mondayOf(from),
      dayOfWeek: dow,
      cancelledAt: 'moved',
      cancelReason: null,
      movedFromDate: null,
      movedTo: dateOfMeeting(m),
    });
  }
  return out;
}

/** A row's key: a stand-in shares its meeting's id. */
export function rowKey(m: { id: string; movedTo?: string }): string {
  return m.movedTo ? `${m.id}:moved` : m.id;
}

/** «сб 24 окт.» — the day as the move lines say it, in the reader's language. */
export function movedDayLabel(iso: string, lang: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
