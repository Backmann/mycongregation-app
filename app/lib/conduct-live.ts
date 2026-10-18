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
/**
 * One ask may take this long, then it counts as failed (17 October 2026).
 * The general limit is 60 s: a request that hangs — Wi-Fi up, no way
 * through — was waited for a whole minute, and the library does not start
 * the next ask while one is still out. For that minute a watching device
 * went on drawing the old part in colour as if nothing were wrong.
 */
export const LIVE_REQUEST_TIMEOUT_MS = 5000;
/**
 * A watching device with no good answer for longer than this no longer
 * knows where the meeting is: two missed asks and a little slack.
 */
export const LIVE_STALE_MS = 7000;

/**
 * Whether what this device shows of somebody else's run can still be
 * trusted (17 October 2026). Not when the last ask failed, not when no good
 * answer came for LIVE_STALE_MS (an ask still out), and not when the device
 * that runs it has gone silent — then its «Следующая» does not reach the
 * server either. A screen that cannot be trusted greys the countdown and
 * says so in words, instead of turning red at somebody on the stage.
 */
export function watchUnsure(input: {
  failed: boolean;
  lastGoodAtMs: number;
  nowMs: number;
  controllerSilent: boolean;
}): boolean {
  if (input.failed || input.controllerSilent) return true;
  return !(input.lastGoodAtMs > 0) || input.nowMs - input.lastGoodAtMs > LIVE_STALE_MS;
}

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
  // When each part began — moments too, so shifted the same way.
  out.starts = (s.starts ?? []).map((m) => shift(m, offsetMs));
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
    starts: Array.isArray(o.starts) ? o.starts.map((m) => shift(m, -offsetMs)) : [],
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

/**
 * The latest moment a run records — its last tap, near enough: a part begun,
 * a pause, a counsel, the end. Null for a run not begun.
 */
export function lastMoment(s: Pick<RunState, 'startedAt' | 'counselFrom' | 'meetingStartedAt' | 'pausedAt' | 'finishedAt' | 'starts'>): number | null {
  let best: number | null = null;
  for (const m of [s.startedAt, s.counselFrom, s.meetingStartedAt, s.pausedAt, s.finishedAt, ...(s.starts ?? [])]) {
    if (typeof m === 'number' && Number.isFinite(m) && (best === null || m > best)) best = m;
  }
  return best;
}

/**
 * A device opening the meeting with a run of its own already kept on it,
 * while the server has one too (18 October 2026): whose is the meeting?
 * Before, a kept run always counted as «taps the server has not had yet» and
 * was sent up over the server's. The phone opened at 13:56 with what it had
 * counted at 13:05 and put the meeting back by half an hour on every screen.
 * Now the kept run wins only when it is the LATER one — taps made here with
 * no signal; an older one gives way to the server's.
 */
export function keptRunIsNewer(
  kept: Parameters<typeof lastMoment>[0],
  server: Parameters<typeof lastMoment>[0] | null,
): boolean {
  const k = lastMoment(kept);
  if (k === null) return false;
  if (!server) return true;
  const s = lastMoment(server);
  return s === null || k > s;
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

/** The responsibilities that oversee how the midweek meeting runs. */
export const CONDUCT_OVERSEER_RESPONSIBILITIES = ['adviser', 'life_ministry_overseer'] as const;

/**
 * Who oversees how the midweek meeting runs (Lionel, 16 October 2026): the
 * admins, the brother who gives counsel and the Life and Ministry overseer.
 * They read the result for its seven days and may watch the meeting run; the
 * same rule as the server's (common/conduct-overseer.ts). The chairman and
 * the timekeeper see the result on their own screen when the meeting ends.
 */
/**
 * The weekend meeting's (Lionel, 18 October 2026): the coordinator of the
 * body of elders and his assistant, the Watchtower study conductor and his
 * assistants, the counsel brother. The server's list is the same.
 */
export const WEEKEND_CONDUCT_OVERSEER_RESPONSIBILITIES = [
  'body_coordinator',
  'body_coordinator_assistant',
  'wt_study_conductor',
  'wt_study_conductor_backup',
  'adviser',
] as const;

export function isConductOverseer(
  role: string | null | undefined,
  responsibilities: Iterable<string>,
  kind: 'midweek' | 'weekend' = 'midweek',
): boolean {
  if (role === 'admin') return true;
  const list: readonly string[] =
    kind === 'weekend' ? WEEKEND_CONDUCT_OVERSEER_RESPONSIBILITIES : CONDUCT_OVERSEER_RESPONSIBILITIES;
  for (const r of responsibilities) {
    if (list.includes(r)) return true;
  }
  return false;
}
