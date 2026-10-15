/**
 * THE CONDUCT RUN AS KEPT ON THE DEVICE — one place that reads it, one that
 * writes it, and one that keeps it in step with the programme.
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
 *   - unversioned v2 (14 October, a9272fb): the shape below without `v`,
 *     `keys`, `legacyKeys` and `changed`.
 *   - v2: what `writeRunRecord` writes.
 *
 * A v1 record of a meeting that is running NOW (its part started less than
 * three hours ago) is carried on: same part, same clock. That moment is the
 * dangerous one — a deploy on a Wednesday evening reaches a chairman's
 * browser the moment the page reloads. The parts it timed keep the counsel
 * inside, so the summary compares them with part + counsel and says so. Any
 * other v1 record — finished, paused, days old — is dropped: it has nothing a
 * chairman could still use (v1 never saved a result to the server).
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
 * NO IMPORTS, on purpose: scripts/check-conduct-record.mjs loads this file on
 * its own, the way check-run-order.mjs loads lib/run-order.ts.
 */

export const RUN_RECORD_VERSION = 2;

/** A v1 part older than this is not a meeting that is still running. */
export const LEGACY_LIVE_MS = 3 * 60 * 60 * 1000;

export interface ProgrammeChange {
  /** Segment keys that appeared after the meeting started. */
  added: string[];
  /** Segment keys that were there at the start and are gone now. */
  removed: string[];
}

export interface RunState {
  /** Which segment is running; equals the number of segments once the meeting ends. */
  index: number;
  /** Seconds each finished segment took — the part itself, no counsel. */
  spent: number[];
  /** Seconds of counsel after a student part, by the part's position. */
  counsel: (number | null)[];
  /**
   * When the current segment's clock started, epoch ms; null while paused.
   * IN THE FUTURE during the counsel minute: the clock starts by itself then.
   */
  startedAt: number | null;
  /** Seconds accumulated on the CURRENT segment before the latest pause. */
  carried: number;
  /** When the counsel minute began (the tap on «Следующая»); null otherwise. */
  counselFrom: number | null;
  /** When the meeting's first part started. */
  meetingStartedAt: number | null;
  /** Paused seconds already over — they count in the drift, not in a part. */
  pausedSec: number;
  pausedAt: number | null;
  finishedAt: number | null;
  /** Whether the finished run reached the server. */
  saved: boolean;
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
  keys: null,
  legacyKeys: [],
  changed: null,
  prev: null,
};

export type RecordVerdict =
  /** Nothing kept for this week. */
  | 'none'
  /** v2, with or without the version written on it. */
  | 'current'
  /** v1 of a meeting running now — carried on. */
  | 'legacy-continued'
  /** v1 of anything else — dropped; the caller removes it from storage. */
  | 'legacy-dropped'
  /** Not JSON, or not a run at all — dropped likewise. */
  | 'unreadable';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isNumOrNull = (x: unknown): x is number | null => x === null || isNum(x);
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.map((v) => (isNum(v) ? v : 0)) : []);

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
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { state: EMPTY_RUN, verdict: 'unreadable' };
    }
    o = parsed as Record<string, unknown>;
  } catch {
    return { state: EMPTY_RUN, verdict: 'unreadable' };
  }
  if (!isNum(o.index) || !Array.isArray(o.spent)) {
    return { state: EMPTY_RUN, verdict: 'unreadable' };
  }

  // v2 — written with its version, or by a9272fb without one.
  if (o.v === RUN_RECORD_VERSION || 'meetingStartedAt' in o) {
    const { v: _v, ...rest } = o;
    const state: RunState = { ...EMPTY_RUN, ...(rest as Partial<RunState>) };
    // a9272fb wrote no keys: its positions are those of the programme on
    // screen (the run order's keys did not change between the two).
    if (state.meetingStartedAt !== null && !Array.isArray(state.keys)) {
      state.keys = [...keys];
    }
    if (!Array.isArray(state.legacyKeys)) state.legacyKeys = [];
    return { state, verdict: 'current' };
  }

  // v1.
  const startedAt = o.startedAt;
  const live =
    isNum(startedAt) && now >= startedAt && now - startedAt < LEGACY_LIVE_MS && o.index < keys.length;
  if (!live) return { state: EMPTY_RUN, verdict: 'legacy-dropped' };

  const index = Math.max(0, Math.floor(o.index));
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
  const done = new Set(old.slice(0, Math.min(state.index, old.length)));
  const spentBy = new Map<string, number>();
  const counselBy = new Map<string, number | null>();
  old.forEach((k, i) => {
    if (i < state.index) {
      spentBy.set(k, state.spent[i] ?? 0);
      counselBy.set(k, state.counsel[i] ?? null);
    }
  });

  const current = finished ? null : old[state.index];
  let index: number;
  if (finished) index = keys.length;
  else if (current !== undefined && current !== null && keys.includes(current)) index = keys.indexOf(current);
  else index = keys.findIndex((k) => !done.has(k));

  let next: RunState = { ...state };
  if (!finished && index === -1) {
    // The running part and every part after it are gone: the meeting has
    // nothing left to run. The running part's seconds go with it.
    index = keys.length;
    next = { ...next, startedAt: null, carried: 0, counselFrom: null, pausedAt: null, finishedAt: now };
  }

  const spent: number[] = [];
  const counsel: (number | null)[] = [];
  for (let j = 0; j < Math.min(index, keys.length); j++) {
    // A part that appeared behind the running one was never timed: 0 s.
    spent.push(spentBy.get(keys[j]) ?? 0);
    counsel.push(counselBy.has(keys[j]) ? (counselBy.get(keys[j]) ?? null) : null);
  }

  // The counsel minute belongs to the part just before the running one. If
  // that is no longer the part that was counselled, the minute ends now and
  // the running part starts: nobody is left waiting on a minute for a part
  // that moved.
  if (next.counselFrom !== null && !finished) {
    const counselled = old[state.index - 1];
    if (keys[index - 1] !== counselled) {
      const at = Math.max(now, next.counselFrom);
      const j = keys.indexOf(counselled);
      if (j >= 0 && j < index) counsel[j] = (at - next.counselFrom) / 1000;
      next = { ...next, counselFrom: null, startedAt: at };
    }
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
