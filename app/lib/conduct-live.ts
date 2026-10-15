/**
 * THE MEETING AS IT RUNS, shared (15 October 2026): the timekeeper's device
 * taps through the parts and the chairman's iPad — and any appointed brother
 * who wants to — watches the same run. The server keeps one row per meeting
 * (server conduct-live) and says who may change it.
 *
 * Pure: no imports, so scripts/check-conduct-live.mjs can pin it.
 *
 * TIMES ON THE WIRE ARE SERVER TIME. The run's absolute times are the
 * controller's own clock; two devices disagree by seconds, and a countdown
 * that is three seconds off on the chairman's screen says «0:00» while the
 * timekeeper's says «0:03». Every answer carries the server's time; each
 * device shifts by its own difference on the way out and on the way in.
 */
import type { RunState } from './conduct-run-record';

/** How often a watching or running device asks. */
export const LIVE_POLL_MS = 2000;
/** A device silent for longer than this is «не на связи». */
export const LIVE_SILENT_MS = 20_000;

/** The run's fields that are moments, not durations. */
const MOMENTS = ['startedAt', 'counselFrom', 'meetingStartedAt', 'pausedAt', 'finishedAt'] as const;

/** What goes to the server: the run without the device's own bookkeeping. */
export type WireState = Omit<RunState, 'prev' | 'pending' | 'saved'> & { v: 1 };

function shift(n: unknown, by: number): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n + by : null;
}

/** Local run → what the server keeps. `offsetMs` = server clock − local clock. */
export function toWire(s: RunState, offsetMs: number): WireState {
  const { prev: _p, pending: _q, saved: _s, ...rest } = s;
  const out = { ...rest, v: 1 as const };
  for (const k of MOMENTS) out[k] = shift(s[k], offsetMs);
  return out;
}

const nums = (x: unknown): number[] =>
  Array.isArray(x) ? x.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0)) : [];
const numsOrNull = (x: unknown): (number | null)[] =>
  Array.isArray(x) ? x.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : null)) : [];
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((k): k is string => typeof k === 'string') : []);

/**
 * What the server keeps → a run this device can show. Anything it does not
 * understand reads as «not started», never as a crash on the chairman's iPad.
 */
export function fromWire(raw: unknown, offsetMs: number): RunState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.index !== 'number' || !Number.isInteger(o.index) || o.index < 0) return null;
  const changed = o.changed as RunState['changed'];
  return {
    index: o.index,
    spent: nums(o.spent),
    counsel: numsOrNull(o.counsel),
    startedAt: shift(o.startedAt, -offsetMs),
    carried: typeof o.carried === 'number' && Number.isFinite(o.carried) ? o.carried : 0,
    counselFrom: shift(o.counselFrom, -offsetMs),
    meetingStartedAt: shift(o.meetingStartedAt, -offsetMs),
    pausedSec: typeof o.pausedSec === 'number' && Number.isFinite(o.pausedSec) ? o.pausedSec : 0,
    pausedAt: shift(o.pausedAt, -offsetMs),
    finishedAt: shift(o.finishedAt, -offsetMs),
    saved: false,
    pending: null,
    keys: o.keys === null ? null : strs(o.keys),
    legacyKeys: strs(o.legacyKeys),
    changed:
      changed && typeof changed === 'object' && Array.isArray(changed.added) && Array.isArray(changed.removed)
        ? { added: strs(changed.added), removed: strs(changed.removed) }
        : null,
    prev: null,
  };
}

/** Two runs the same as far as the server is concerned. */
export function sameWire(a: WireState | null, b: WireState | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One sample of the server's clock: asked at `sentAt`, answered at
 * `receivedAt` (both local), the server said `serverNowMs`. The server's
 * moment is taken to be the middle of the round trip.
 */
export function offsetSample(sentAt: number, receivedAt: number, serverNowMs: number) {
  return { offset: serverNowMs - (sentAt + receivedAt) / 2, rtt: Math.max(0, receivedAt - sentAt) };
}

/**
 * The offset to use from recent samples: the one with the shortest round
 * trip, which is the one least bent by a slow network.
 */
export function bestOffset(samples: { offset: number; rtt: number }[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
}

/** Silent since `seenAtISO`, measured on the server's clock. */
export function isSilent(seenAtISO: string | null, serverNowMs: number): boolean {
  if (!seenAtISO) return true;
  const t = Date.parse(seenAtISO);
  return !Number.isFinite(t) || serverNowMs - t > LIVE_SILENT_MS;
}

export interface LiveRoles {
  mayRun: boolean;
  isChairman: boolean;
  isTimekeeper: boolean;
  hasTimekeeper: boolean;
  timekeeperName: string | null;
}

/**
 * Who taps on this device: «run» — this device's taps count; «watch» — it
 * shows what the controller's device says.
 *
 * - Somebody runs it already: the one whose taps count runs, everybody else
 *   watches (a take-over is what changes it).
 * - Nobody yet: the timekeeper starts it. With a timekeeper named, the
 *   chairman and an admin open WATCHING — the iPad is for looking at, the
 *   tapping is the timekeeper's (Lionel, 15 October 2026); «Взять ведение» is
 *   there if he does not come. Without one, the chairman runs it as before.
 * - A device that started counting already (no signal at the start) goes on.
 * - No answer from the server at all (no signal, an older server): as before
 *   Live existed — whoever may run it, runs it on his own device.
 */
export function liveMode(input: {
  practice: boolean;
  canRunLocally: boolean;
  answered: boolean;
  live: { mine: boolean } | null;
  roles: LiveRoles | null;
  localStarted: boolean;
}): 'run' | 'watch' {
  if (input.practice) return 'run';
  if (!input.answered || !input.roles) return input.canRunLocally ? 'run' : 'watch';
  if (input.live) return input.live.mine ? 'run' : 'watch';
  if (!input.roles.mayRun) return 'watch';
  if (input.localStarted) return 'run';
  if (input.roles.hasTimekeeper && !input.roles.isTimekeeper) return 'watch';
  return 'run';
}
