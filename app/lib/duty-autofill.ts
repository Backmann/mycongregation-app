import type { Absence, ActivityItem, MonthDutyMeeting, MonthDutyRow, MonthOfDuties, Publisher } from './api';
import { absenceOn, busyAt, candidatesFor } from './duty-load';
import { placeKey } from './duty-places';

/**
 * «ЗАПОЛНИТЬ ПУСТЫЕ ПО ОЧЕРЕДИ» (Lionel, 27 October 2026).
 *
 * A proposal for every empty place of a month — written nowhere until the
 * coordinator saves it. The queue is the duties' own, as the programme has
 * its own («части программы тоже имеют логику очереди»):
 *
 *  1. whoever has waited longest at THIS place comes first (never — first of
 *     all), the way the programme's picker floats up who did a part longest
 *     ago;
 *  2. then whoever has fewest places this month, so that one brother does not
 *     get three while another gets none;
 *  3. not the same place two meetings of a kind running, while anybody else
 *     can take it.
 *
 * Never proposed: a person away that day, one already at a place or with a
 * part in that meeting, one whose card does not carry the place's mark (or a
 * sister where the place has no mark), a meeting already held, a filled
 * place, the timekeeper (a place a congregation may leave empty), and the
 * first microphone of a midweek meeting where the congregation's rule hands
 * it to the brother with the Treasures talk.
 */

export interface AutofillInput {
  month: MonthOfDuties;
  publishers: Publisher[];
  absences: Absence[] | undefined;
  /** Duties before the month, from /publisher-activity. */
  history: { publisherId: string; items: ActivityItem[] }[];
  /** The congregation's rule: the first midweek microphone follows the Treasures talk. */
  treasuresMicRule: boolean;
}

/**
 * A meeting whose places may be filled by turns: its programme is loaded and
 * every part has a person (Lionel, 27 October 2026 — «почти готова» is not
 * enough, and at the weekend the Watchtower reader is waited for too; the
 * closing prayer is not waited for, see NOT_AWAITED). A
 * place filled before the programme invites a brother to the microphone on
 * the evening he is also given a part.
 */
export function programmeReady(m: MonthDutyMeeting): boolean {
  const p = programmeForDuties(m);
  return !!p && p.loaded && p.total > 0 && p.assigned >= p.total;
}

/**
 * Parts a meeting may still lack when its places are filled: the closing
 * prayer is often given out on the evening itself (Lionel, 27 October 2026 —
 * «не стоит препятствовать»). If the brother who gets it also stands at a
 * place, the programme's picker already says so («на этой встрече: …»).
 */
const NOT_AWAITED = new Set(['midweek_closing_prayer', 'weekend_closing_prayer']);

/** The programme count as the duties read it: the closing prayer aside. */
export function programmeForDuties(
  m: MonthDutyMeeting,
): { loaded: boolean; assigned: number; total: number } | null {
  if (!m.programme) return null;
  const waived = m.programme.missing.filter((k) => NOT_AWAITED.has(k)).length;
  return { loaded: m.programme.loaded, assigned: m.programme.assigned, total: m.programme.total - waived };
}

export interface AutofillResult {
  /** `<meeting index>|<row key>` → the person proposed. */
  proposals: Map<string, string>;
  /** Cells nobody could be proposed for. */
  nobody: Set<string>;
  /** Meetings ahead with empty places, passed over: their programme is not complete. */
  skipped: number[];
}

/** The rows of a meeting with their table key, `<place>#<n>`, in sheet order. */
export function rowKeysOf(m: MonthDutyMeeting): { key: string; row: MonthDutyRow; ordinal: number }[] {
  const seen = new Map<string, number>();
  return [...m.rows]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slotIndex - b.slotIndex)
    .map((row) => {
      const place = placeKey(row);
      const n = seen.get(place) ?? 0;
      seen.set(place, n + 1);
      return { key: `${place}#${n}`, row, ordinal: n };
    });
}

export const cellId = (meetingIndex: number, rowKey: string) => `${meetingIndex}|${rowKey}`;

export function autofill(input: AutofillInput): AutofillResult {
  const { month, publishers, absences, history } = input;
  const proposals = new Map<string, string>();
  const nobody = new Set<string>();
  const skipped: number[] = [];

  // When each person last stood at each place: the history before the month,
  // then — as the month is walked in order — its own filled places and the
  // proposals made so far.
  const last = new Map<string, Map<string, string>>();
  const note = (publisherId: string, place: string, week: string) => {
    const m = last.get(publisherId) ?? new Map<string, string>();
    if ((m.get(place) ?? '') < week) m.set(place, week);
    last.set(publisherId, m);
  };
  for (const h of history) {
    for (const it of h.items) {
      if (it.kind !== 'duty' || !it.dutyType) continue;
      note(h.publisherId, placeKey({ dutyType: it.dutyType, customLabel: it.customLabel ?? null }), it.weekStartDate);
    }
  }
  // Places this month — what is already filled, and each proposal as made.
  const monthCount = new Map<string, number>();
  for (const m of month.meetings) {
    for (const r of m.rows) if (r.publisherId) monthCount.set(r.publisherId, (monthCount.get(r.publisherId) ?? 0) + 1);
  }

  const order = month.meetings
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.held)
    .sort((a, b) => a.m.date.localeCompare(b.m.date));

  // Who stood at each place at the previous meeting of each kind.
  const previousAt = new Map<string, Map<string, Set<string>>>();

  for (const { m, i } of order) {
    const rows = rowKeysOf(m);
    const busy = busyAt(m);
    const here = new Map<string, Set<string>>();
    const stand = (place: string, id: string) => here.set(place, (here.get(place) ?? new Set<string>()).add(id));
    for (const r of rows) {
      const place = r.key.split('#')[0];
      if (r.row.publisherId) {
        stand(place, r.row.publisherId);
        note(r.row.publisherId, place, m.weekStartDate);
      }
    }
    const fillable = !m.locked && programmeReady(m);
    if (!m.locked && !fillable && rows.some((r) => !r.row.publisherId && r.row.dutyType !== 'timekeeper')) {
      skipped.push(i);
    }
    if (fillable) {
      for (const r of rows) {
        if (r.row.publisherId) continue;
        if (r.row.dutyType === 'timekeeper') continue;
        if (input.treasuresMicRule && m.eventType === 'midweek' && r.row.dutyType === 'microphone' && r.ordinal === 0) {
          continue;
        }
        const place = r.key.split('#')[0];
        const before = previousAt.get(m.eventType ?? '')?.get(place) ?? new Set<string>();
        const pool = candidatesFor(r.row.capability, publishers).filter(
          (p) => !busy.has(p.id) && !absenceOn(absences, p.id, m.date),
        );
        const rank = (p: Publisher) => [
          last.get(p.id)?.get(place) ?? '',
          monthCount.get(p.id) ?? 0,
        ] as const;
        const pick = (list: Publisher[]) =>
          [...list].sort((a, b) => {
            const [la, ca] = rank(a);
            const [lb, cb] = rank(b);
            return la.localeCompare(lb) || ca - cb || a.displayName.localeCompare(b.displayName);
          })[0];
        const chosen = pick(pool.filter((p) => !before.has(p.id))) ?? pick(pool);
        const id = cellId(i, r.key);
        if (!chosen) {
          nobody.add(id);
          continue;
        }
        proposals.set(id, chosen.id);
        busy.add(chosen.id);
        stand(place, chosen.id);
        note(chosen.id, place, m.weekStartDate);
        monthCount.set(chosen.id, (monthCount.get(chosen.id) ?? 0) + 1);
      }
    }
    previousAt.set(m.eventType ?? '', here);
  }
  return { proposals, nobody, skipped };
}
