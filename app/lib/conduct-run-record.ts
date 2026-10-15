/**
 * THE CONDUCT RUN AS KEPT ON THE DEVICE — one place that reads it, one that
 * writes it, one that keeps it in step with the programme, and one that says
 * when it is old enough to go.
 *
 * WHY THIS FILE EXISTS (15 October 2026). The chairman's run lives under
 * `conduct:midweek:<week>` in AsyncStorage (localStorage on the web). Its
 * shape changed on 14 October and nothing said so: the new screen merged an
 * old record into its empty state, found no `meetingStartedAt`, and showed
 * «Начать встречу» over a clock that was still running — one tap on it wiped
 * the meeting. From now on every record carries a version, and every shape the
 * screen has ever written is recognised HERE:
 *
 *   - v1 (18 September – 14 October): { index, spent, startedAt, carried }.
 *     A part's seconds INCLUDED the counsel minute after it; there was no
 *     meeting start and no pause accounting.
 *   - unversioned v2 (14 October, a9272fb) and v2 (15 October): counsel was
 *     a minute that ran by itself — «Следующая» moved `index` to the NEXT
 *     part at once and set its `startedAt` a minute into the future.
 *   - v3 (variant A, 15 October): the student part ends with «Закончено»;
 *     `index` STAYS on that part while its counsel runs (`counselFrom` set,
 *     `startedAt` null), the counsel counts UP and starts nothing; the next
 *     part starts only with «Следующая».
 *
 * A v1 record of a meeting that is running NOW (its part started less than
 * three hours ago) is carried on: same part, same clock. That moment is the
 * dangerous one — a deploy on a Wednesday evening reaches a chairman's
 * browser the moment the page reloads. The parts it timed keep the counsel
 * inside, so the summary compares them with part + counsel and says so. Any
 * other v1 record — finished, paused, days old — is dropped: it has nothing a
 * chairman could still use (v1 never saved a result to the server).
 *
 * A v2 record caught in its counsel minute is turned into v3's counsel: back
 * onto the counselled part, its counsel running since the same moment.
 *
 * THE PROGRAMME CAN CHANGE UNDER A RUNNING MEETING. With no signal the screen
 * starts from the programme kept on the device, and replaces it with the
 * server's the moment a request gets through; an edit made since it was kept
 * then adds or removes a part. A run held by POSITION would carry on against
 * the wrong part. So the run remembers the segment keys it was started with
 * and, when they differ, is re-laid by KEY (`reconcileKeys`): the running part
 * stays the running part, finished parts keep their seconds, and what changed
 * is kept in `changed` for the screen to say out loud.
 *
 * SEVEN DAYS (Lionel, 15 October 2026): the server keeps a meeting's result
 * seven days, and the device keeps its run no longer (`isExpiredRecord`).
 *
 * NO IMPORTS, on purpose: scripts/check-conduct-record.mjs loads this file on
 * its own, the way check-run-order.mjs loads lib/run-order.ts.
 */

export const RUN_RECORD_VERSION = 3;

/** A v1 part older than this is not a meeting that is still running. */
export const LEGACY_LIVE_MS = 3 * 60 * 60 * 1000;

/** How long a run stays on the device — as long as the server keeps it. */
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** A record is `conduct:midweek:<Monday>`. */
export const RECORD_PREFIX = 'conduct:midweek:';

export interface ProgrammeChange {
  /** Segment keys that appeared after the meeting started. */
  added: string[];
  /** Segment keys that were there at the start and are gone now. */
  removed: string[];
}

/** The result as it goes to the server — the shape is the API's. */
export interface PendingResult {
  segments: unknown[];
  totalSec: number;
  plannedSec: number;
}

export interface RunState {
  /** Which segment is running; equals the number of segments once the meeting ends. */
  index: number;
  /** Seconds each finished segment took — the part itself, no counsel. */
  spent: number[];
  /** Seconds of counsel after a student part, by the part's position. */
  counsel: (number | null)[];
  /** When the current segment's clock started, epoch ms; null while paused or in counsel. */
  startedAt: number | null;
  /** Seconds accumulated on the CURRENT segment before the latest pause. */
  carried: number;
  /**
   * When the counsel after the CURRENT part began (the tap on «Закончено»);
   * null otherwise. While it is set, the part's own seconds are in `spent`.
   */
  counselFrom: number | null;
  /** When the meeting's first part started. */
  meetingStartedAt: number | null;
  /** Paused seconds already over — they count in the drift, not in a part. */
  pausedSec: number;
  pausedAt: number | null;
  finishedAt: number | null;
  /** Whether the finished run reached the server. */
  saved: boolean;
  /**
   * The finished run as it is to be sent, until it has been. Kept so it can
   * go the moment there is a signal again — from any screen, not only this
   * one (lib/conduct-resend.ts).
   */
  pending: PendingResult | null;
  /** Segment keys, in order, the positions above refer to; null before the start. */
  keys: string[] | null;
  /** Parts timed by v1 — their seconds include the counsel minute. */
  legacyKeys: string[];
  /** What changed in the programme while the meeting ran. */
  changed: ProgrammeChange | null;
  /** The state before the last tap, for «Вернуть». One step, never a chain. */
  prev: Omit<RunState, 'prev'> | null;
}

export const EMPTY_RUN: RunState = {
  index: 0,
  spent: [],
  counsel: [],
  startedAt: null,
  carried: 0,
  counselFrom: null,
  meetingStartedAt: null,
  pausedSec: 0,
  pausedAt: null,
  finishedAt: null,
  saved: false,
  pending: null,
  keys: null,
  legacyKeys: [],
  changed: null,
  prev: null,
};

/** In the counsel after a student part: the part is over, the next not begun. */
export function inCounsel(s: RunState): boolean {
  return s.counselFrom !== null && s.startedAt === null && s.finishedAt === null;
}

export type RecordVerdict =
  /** Nothing kept for this week. */
  | 'none'
  /** v3, or a v2 brought to v3. */
  | 'current'
  /** v1 of a meeting running now — carried on. */
  | 'legacy-continued'
  /** v1 of anything else — dropped; the caller removes it from storage. */
  | 'legacy-dropped'
  /** Not JSON, or not a run at all — dropped likewise. */
  | 'unreadable';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.map((v) => (isNum(v) ? v : 0)) : []);

function parse(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (!isNum(o.index) || !Array.isArray(o.spent)) return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * v2's counsel minute, as v3's counsel. In v2 «Следующая» had already moved
 * on: `index` on the next part, its `startedAt` in the future. If that moment
 * has not come, the counsel is still running — back onto the counselled part.
 * If it has, the next part is running in v2 and in v3 alike: nothing to do.
 */
function v2ToV3(s: RunState, now: number): RunState {
  const waiting =
    s.counselFrom !== null && s.startedAt !== null && s.startedAt > now && s.index > 0 && s.finishedAt === null;
  if (waiting) {
    const counsel = s.counsel.slice(0, s.index - 1);
    return { ...s, index: s.index - 1, startedAt: null, carried: 0, counsel, prev: null };
  }
  // The minute ran out and the next part started by itself: the counsel that
  // was given is the full minute v2 had written down. Nothing pending.
  return { ...s, counselFrom: null, prev: null };
}

/**
 * What is kept for the week, as a run the screen can use.
 * `keys` — the segment keys of the programme on screen now.
 */
export function readRunRecord(
  raw: string | null,
  keys: string[],
  now: number,
): { state: RunState; verdict: RecordVerdict } {
  if (raw === null || raw === '') return { state: EMPTY_RUN, verdict: 'none' };
  const o = parse(raw);
  if (!o) return { state: EMPTY_RUN, verdict: 'unreadable' };

  // v2 and v3 — v2 written with its version, or by a9272fb without one.
  if (o.v === RUN_RECORD_VERSION || o.v === 2 || 'meetingStartedAt' in o) {
    const { v, ...rest } = o;
    let state: RunState = { ...EMPTY_RUN, ...(rest as Partial<RunState>) };
    // a9272fb wrote no keys: its positions are those of the programme on
    // screen (the run order's keys did not change between the two).
    if (state.meetingStartedAt !== null && !Array.isArray(state.keys)) {
      state.keys = [...keys];
    }
    if (!Array.isArray(state.legacyKeys)) state.legacyKeys = [];
    if (state.pending === undefined) state.pending = null;
    if (v !== RUN_RECORD_VERSION) state = v2ToV3(state, now);
    return { state, verdict: 'current' };
  }

  // v1. `parse` has checked that the index is a number.
  const v1Index = o.index as number;
  const startedAt = o.startedAt;
  const live =
    isNum(startedAt) && now >= startedAt && now - startedAt < LEGACY_LIVE_MS && v1Index < keys.length;
  if (!live) return { state: EMPTY_RUN, verdict: 'legacy-dropped' };

  const index = Math.max(0, Math.floor(v1Index));
  const spent = nums(o.spent).slice(0, index);
  while (spent.length < index) spent.push(0);
  const carried = isNum(o.carried) ? o.carried : 0;
  const before = spent.reduce((s, x) => s + x, 0) + carried;
  return {
    verdict: 'legacy-continued',
    state: {
      ...EMPTY_RUN,
      index,
      spent,
      counsel: spent.map(() => null),
      startedAt,
      carried,
      // No meeting start in v1: as far back as the parts it timed reach.
      // v1 kept no pauses either, so a paused stretch is simply not in here.
      meetingStartedAt: startedAt - before * 1000,
      keys: [...keys],
      legacyKeys: keys.slice(0, index),
    },
  };
}

/** The record as it goes into storage. */
export function writeRunRecord(state: RunState): string {
  return JSON.stringify({ v: RUN_RECORD_VERSION, ...state });
}

/**
 * Whether a kept record is old enough to go: seven days after the meeting
 * ended (or, unfinished, after it began); a record of a meeting never begun,
 * two weeks after its Monday. Anything unreadable goes at once.
 */
export function isExpiredRecord(raw: string | null, weekISO: string, now: number): boolean {
  if (raw === null) return false;
  const o = parse(raw);
  if (!o) return true;
  const at = isNum(o.finishedAt) ? o.finishedAt : isNum(o.meetingStartedAt) ? o.meetingStartedAt : null;
  if (at !== null) return now - at > KEEP_MS;
  // v1 and a run never begun: by the week. «YYYY-MM-DD» at local midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekISO);
  if (!m) return true;
  const monday = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return now - monday > 2 * KEEP_MS;
}

const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);
const union = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.includes(x))];

/**
 * The run re-laid onto the programme now on screen. Returns the SAME object
 * when there is nothing to do — before the start, or when the keys agree.
 */
export function reconcileKeys(state: RunState, keys: string[], now: number): RunState {
  if (state.meetingStartedAt === null || keys.length === 0) return state;
  if (!state.keys) return { ...state, keys: [...keys] };
  const old = state.keys;
  if (sameKeys(old, keys)) return state;

  const finished = state.finishedAt !== null || state.index >= old.length;
  const counselling = inCounsel(state);
  const done = new Set(old.slice(0, Math.min(state.index, old.length)));
  const spentBy = new Map<string, number>();
  const counselBy = new Map<string, number | null>();
  old.forEach((k, i) => {
    // The counselled part's own seconds are in `spent` already.
    if (i < state.index || (counselling && i === state.index)) {
      spentBy.set(k, state.spent[i] ?? 0);
      counselBy.set(k, state.counsel[i] ?? null);
    }
  });

  const current = finished ? null : old[state.index];
  let index: number;
  if (finished) index = keys.length;
  else if (current !== undefined && current !== null && keys.includes(current)) index = keys.indexOf(current);
  else index = keys.findIndex((k) => !done.has(k) && k !== current);

  let next: RunState = { ...state };
  if (!finished && index === -1) {
    // The running part and every part after it are gone: the meeting has
    // nothing left to run. The running part's seconds go with it.
    index = keys.length;
    next = { ...next, startedAt: null, carried: 0, counselFrom: null, pausedAt: null, finishedAt: now };
  } else if (counselling && current !== null && !keys.includes(current)) {
    // The part being counselled is gone: its counsel ends, the part that
    // takes its place starts now.
    next = { ...next, counselFrom: null, startedAt: now, carried: 0 };
  }

  const upTo = Math.min(index, keys.length);
  const spent: number[] = [];
  const counsel: (number | null)[] = [];
  for (let j = 0; j < upTo; j++) {
    // A part that appeared behind the running one was never timed: 0 s.
    spent.push(spentBy.get(keys[j]) ?? 0);
    counsel.push(counselBy.has(keys[j]) ? (counselBy.get(keys[j]) ?? null) : null);
  }
  if (inCounsel(next) && index < keys.length) {
    spent.push(spentBy.get(keys[index]) ?? 0);
  }

  const added = keys.filter((k) => !old.includes(k));
  const removed = old.filter((k) => !keys.includes(k));
  return {
    ...next,
    index,
    spent,
    counsel,
    keys: [...keys],
    legacyKeys: state.legacyKeys.filter((k) => keys.includes(k)),
    changed: {
      added: union(state.changed?.added ?? [], added),
      removed: union(state.changed?.removed ?? [], removed),
    },
    // «Вернуть» would bring back positions of the programme that is gone.
    prev: null,
  };
}
