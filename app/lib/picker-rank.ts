/**
 * Who fits a part best — the order of the people pickers of the programme
 * (Lionel, 19–20 November 2026: «если напарник уже был с возвещателем …
 * чтобы это подсвечивалось. Необходимо идеально продумать это»).
 *
 * Pure: the picker hands over the candidates, each one's history (26 weeks
 * back and 12 ahead, from /publisher-activity) and who is away; this returns
 * three groups and, for each person, the facts the row shows. The gate
 * (scripts/check-picker-rank.mjs) holds the rules below to examples.
 *
 * The numbers behind the rules are the congregation's own (live programme,
 * 20 November 2026, numbers only): a person's student parts come every 7
 * weeks (most 5–10), his own every 11; a pair repeated 3 times in 68, after
 * 15–17 weeks; the programme stands 11 weeks ahead.
 */
import { ministryKind } from './meeting-guidelines';

export interface RankItem {
  weekStartDate: string;
  eventType: string;
  kind: 'part' | 'duty';
  partKey?: string;
  partTitle?: string | null;
  role?: 'primary' | 'assistant';
  assignmentId?: string;
  partnerId?: string | null;
  dutyType?: string;
  customLabel?: string | null;
}

/**
 * student-lead / student-assistant — Bible reading and the ministry parts:
 * the lead counts his OWN parts, the assistant any student part.
 * rotation — the parts given in turn (chairman, study, prayers, Treasures…):
 * the same part, and «not the same brother two weeks running» (п. 17, 25).
 */
export type RankMode = 'student-lead' | 'student-assistant' | 'rotation';

/** Fewer weeks than this since the last part: not among the best. */
export const MIN_GAP_WEEKS = 4;
/** A pair seen within this many weeks back is told. */
export const PAIR_BACK_WEEKS = 26;
/** …and this many ahead. */
export const PAIR_AHEAD_WEEKS = 12;
/** An own part this close ahead is told and keeps one off the best. */
export const OWN_SOON_WEEKS = 3;
/** At most this many best. */
export const BEST_COUNT = 3;

export type RankFlag =
  | { kind: 'pair'; week: string; candidateRole: 'primary' | 'assistant' }
  | { kind: 'sameMeeting'; partKey: string; title: string | null }
  | { kind: 'prevWeek' }
  | { kind: 'nextWeek' }
  | { kind: 'ownSoon'; week: string; weeks: number }
  | { kind: 'rotation' }
  /** A duty at this meeting (microphone, attendant…) — told, not keeping one off. */
  | { kind: 'duty'; dutyType: string; label: string | null }
  /** Told by the picker itself: no mark of the part, or the other gender (family). */
  | { kind: 'noCapability' }
  | { kind: 'otherGender' };

export interface Ranked {
  id: string;
  /** The last part in scope before the week, or null — never. */
  last: { week: string; partKey: string; title: string | null; role: 'primary' | 'assistant' } | null;
  weeksAgo: number | null;
  /** Weeks to the next part in scope after this week, or null. */
  nextIn: number | null;
  flags: RankFlag[];
  /** Why one of the best is there. */
  reason?: 'neverPaired' | 'never' | 'longest';
}

export interface RankResult {
  best: Ranked[];
  others: Ranked[];
  away: Ranked[];
}

export interface RankInput {
  mode: RankMode;
  /** Monday of the week of the part. */
  week: string;
  eventType: string;
  /** The part itself — its own lines are not «another part». */
  partId?: string | null;
  /** The part keys that count as «this part» in rotation mode. */
  partKeys?: readonly string[];
  /** The other side of the pair: the lead for an assistant, and back. */
  otherId?: string | null;
  /**
   * A part one brother holds week after week (the Watchtower conductor): no
   * turn to keep, so «the same part next week» is no fault (review, 20 Nov).
   */
  noTurn?: boolean;
  /** Rotation counts only the discussions among the ministry parts. */
  onlyDiscussion?: boolean;
  /** Facts the picker knows itself (a missing mark, the other gender). */
  extraFlags?: (id: string) => RankFlag[];
  candidates: readonly { id: string }[];
  itemsOf: (id: string) => readonly RankItem[];
  isAway: (id: string) => boolean;
}

const DAY = 86400000;
const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
/** Whole weeks from a to b (b later is positive). */
export const weeksBetween = (a: string, b: string) => Math.round((day(b) - day(a)) / (7 * DAY));

/** A student part of the midweek meeting: Bible reading and the ministry parts, not a discussion. */
export function isStudentItem(it: RankItem): boolean {
  if (it.kind !== 'part' || it.eventType !== 'midweek' || !it.partKey) return false;
  if (it.partKey === 'bible_reading') return true;
  return it.partKey.startsWith('apply_yourself_') && ministryKind(it.partTitle) !== 'discussion';
}

export function rankCandidates(input: RankInput): RankResult {
  const { mode, week, eventType, partId, otherId } = input;
  const scope = new Set(input.partKeys ?? []);
  const student = mode !== 'rotation';
  const inScope = (it: RankItem) =>
    student
      ? isStudentItem(it) && (mode === 'student-assistant' || it.role === 'primary')
      : it.kind === 'part' &&
        !!it.partKey &&
        scope.has(it.partKey) &&
        it.role === 'primary' &&
        (!input.onlyDiscussion || ministryKind(it.partTitle) === 'discussion');

  const rows: (Ranked & { away: boolean; demoted: boolean })[] = [];
  for (const c of input.candidates) {
    const items = input.itemsOf(c.id).filter((it) => !partId || it.assignmentId !== partId);
    const before = items
      .filter((it) => inScope(it) && day(it.weekStartDate) < day(week))
      .sort((a, b) => day(b.weekStartDate) - day(a.weekStartDate));
    const lastItem = before[0];
    const last = lastItem
      ? {
          week: lastItem.weekStartDate.slice(0, 10),
          partKey: lastItem.partKey ?? '',
          title: lastItem.partTitle ?? null,
          role: lastItem.role ?? 'primary',
        }
      : null;
    const weeksAgo = last ? weeksBetween(last.week, week) : null;
    const after = items
      .filter((it) => inScope(it) && day(it.weekStartDate) > day(week))
      .sort((a, b) => day(a.weekStartDate) - day(b.weekStartDate))[0];
    const nextIn = after ? weeksBetween(week, after.weekStartDate) : null;
    const flags: RankFlag[] = [];
    const parts = items.filter((it) => it.kind === 'part');
    const at = (w: number) => parts.filter((it) => weeksBetween(week, it.weekStartDate) === w);

    for (const it of at(0).filter((x) => x.eventType === eventType))
      flags.push({ kind: 'sameMeeting', partKey: it.partKey ?? '', title: it.partTitle ?? null });
    for (const it of items.filter(
      (x) => x.kind === 'duty' && x.eventType === eventType && weeksBetween(week, x.weekStartDate) === 0,
    ))
      flags.push({ kind: 'duty', dutyType: it.dutyType ?? '', label: it.customLabel ?? null });

    if (student) {
      if (at(-1).length > 0) flags.push({ kind: 'prevWeek' });
      if (at(1).length > 0) flags.push({ kind: 'nextWeek' });
      const soon = items
        .filter((it) => isStudentItem(it) && it.role === 'primary')
        .map((it) => ({ it, w: weeksBetween(week, it.weekStartDate) }))
        .filter(({ w }) => w > 1 && w <= OWN_SOON_WEEKS)
        .sort((a, b) => a.w - b.w)[0];
      if (soon) flags.push({ kind: 'ownSoon', week: soon.it.weekStartDate.slice(0, 10), weeks: soon.w });
      if (otherId) {
        const pair = items
          .filter((it) => it.partnerId === otherId && isStudentItem(it))
          .map((it) => ({ it, w: weeksBetween(week, it.weekStartDate) }))
          .filter(({ w }) => w >= -PAIR_BACK_WEEKS && w <= PAIR_AHEAD_WEEKS)
          .sort((a, b) => Math.abs(a.w) - Math.abs(b.w))[0];
        if (pair)
          flags.push({
            kind: 'pair',
            week: pair.it.weekStartDate.slice(0, 10),
            candidateRole: pair.it.role ?? 'primary',
          });
      }
    } else if (!input.noTurn && (at(-1).some((it) => inScope(it)) || at(1).some((it) => inScope(it)))) {
      flags.push({ kind: 'rotation' });
    }
    flags.push(...(input.extraFlags?.(c.id) ?? []));

    const away = input.isAway(c.id);
    // Any fact told keeps one off the best — but a duty at the meeting is
    // only told (duties are moved easily). A student also needs MIN_GAP
    // weeks since the last part. In parts given in turn the turn and another
    // part this meeting (review, 20 November 2026).
    const weighty = flags.filter((f) => f.kind !== 'duty');
    const demoted = student
      ? weighty.length > 0 || (weeksAgo !== null && weeksAgo < MIN_GAP_WEEKS)
      : weighty.length > 0;
    rows.push({ id: c.id, last, weeksAgo, nextIn, flags, away, demoted });
  }

  // Longest without — the nearest part either way, before or after this
  // week (a brother with a part in five weeks is not «never»); never first;
  // then by the candidates' own order (review, 20 November 2026).
  const gap = (r: Ranked) => Math.min(r.weeksAgo ?? Infinity, r.nextIn ?? Infinity);
  const order = (a: Ranked, b: Ranked) => {
    const ga = gap(a);
    const gb = gap(b);
    if (ga === gb) return 0;
    return ga === Infinity ? -1 : gb === Infinity ? 1 : gb - ga;
  };
  const strip = ({ away: _a, demoted: _d, ...r }: Ranked & { away: boolean; demoted: boolean }): Ranked => r;
  const free = rows.filter((r) => !r.away).sort(order);
  const eligible = free.filter((r) => !r.demoted);
  const best = eligible.slice(0, BEST_COUNT).map((r) => ({
    ...strip(r),
    reason:
      mode === 'student-assistant' && otherId
        ? ('neverPaired' as const)
        : r.weeksAgo === null
          ? ('never' as const)
          : ('longest' as const),
  }));
  const bestIds = new Set(best.map((r) => r.id));
  const others = free.filter((r) => !bestIds.has(r.id)).map(strip);
  const away = rows.filter((r) => r.away).sort(order).map(strip);
  return { best, others, away };
}
