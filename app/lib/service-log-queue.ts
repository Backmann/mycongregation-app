import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError } from 'axios';
import {
  extractErrorMessage,
  serviceLogApi,
  type ServiceLogEntry,
  type ServiceLogEntryInput,
} from './api';

/**
 * THE HOURS LOG, WRITTEN WITHOUT A CONNECTION (29 October 2026).
 *
 * Time is written where the ministry happened — a doorstep, a cart, a
 * village — and the network is often not there. So every change goes into
 * this queue on the phone first, counts in the sums at once, and is sent
 * when the server can be reached: in order, one by one.
 *
 * The id of an entry is made here, so a change sent twice is still one
 * entry. What the server refuses on its merits (a closed month, a report
 * already in) is not tried again: it is dropped and the person is told in
 * words. What fails because nothing answered waits for the next try.
 *
 * Kept for one person only, under his id; wiped on sign-out — the profile
 * warns first when something has not gone yet.
 */

export type LogOp =
  | { type: 'put'; id: string; body: ServiceLogEntryInput }
  | { type: 'delete'; id: string };

interface Stored {
  userId: string;
  ops: LogOp[];
}

const KEY = 'mycongregation.hours-queue';
let state: Stored | null = null;
let flushing = false;
const listeners = new Set<() => void>();
/** Refusals to tell the person about, oldest first. */
let refused: string[] = [];

export function newEntryId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 from Math.random where the platform has no crypto: the ids
  // only have to differ between one person's own entries.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function notify() {
  for (const l of listeners) l();
}

export function subscribeQueue(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function load(userId: string): Promise<Stored> {
  if (state && state.userId === userId) return state;
  let ops: LogOp[] = [];
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    // Somebody else's queue on this device is not his to send.
    if (parsed && parsed.userId === userId && Array.isArray(parsed.ops)) ops = parsed.ops;
  } catch {
    ops = [];
  }
  state = { userId, ops };
  return state;
}

async function save(): Promise<void> {
  if (!state) return;
  try {
    if (state.ops.length === 0) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A full store keeps the change in memory until the app closes.
  }
}

/** The changes not yet sent, for one person. */
const NONE: LogOp[] = [];

/**
 * The changes not yet sent, for one person. The array is replaced, never
 * changed in place, whenever the queue changes — React reads it as a store
 * snapshot (useSyncExternalStore), and the compiler's memoisation would
 * otherwise never see a change made inside the same array.
 */
export function pendingOps(userId: string | null | undefined): LogOp[] {
  return state && userId && state.userId === userId ? state.ops : NONE;
}

export async function initQueue(userId: string): Promise<void> {
  await load(userId);
  notify();
  void flush(userId);
}

export async function enqueue(userId: string, op: LogOp): Promise<void> {
  const s = await load(userId);
  // One pending change per entry: the latest one stands.
  s.ops = [...s.ops.filter((o) => o.id !== op.id), op];
  await save();
  notify();
  void flush(userId);
}

/** Refusals collected since last asked — each told once. */
export function takeRefusals(): string[] {
  const out = refused;
  refused = [];
  return out;
}

/**
 * Send what waits, in order. Stops at the first change nothing answered
 * for; drops a change the server refused on its merits.
 */
export async function flush(userId: string): Promise<boolean> {
  if (flushing) return false;
  const s = await load(userId);
  if (s.ops.length === 0) return true;
  flushing = true;
  let changed = false;
  try {
    while (s.ops.length > 0) {
      const op = s.ops[0];
      try {
        if (op.type === 'put') await serviceLogApi.put(op.id, op.body);
        else await serviceLogApi.remove(op.id);
      } catch (e) {
        const status = e instanceof AxiosError ? e.response?.status : undefined;
        if (status && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
          refused.push(extractErrorMessage(e));
        } else {
          break; // nothing answered, or the server is down: try later
        }
      }
      s.ops = s.ops.slice(1);
      changed = true;
      await save();
    }
  } finally {
    flushing = false;
    if (changed) notify();
  }
  return s.ops.length === 0;
}

/** Signing out: what is his goes with him. */
export async function forgetQueue(): Promise<void> {
  state = null;
  refused = [];
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing kept to forget
  }
  notify();
}

/**
 * The month as the person should see it: the server's answer with his
 * unsent changes laid over it, and the sums counted again.
 */
export function withPending<
  T extends {
    month: string;
    entries: ServiceLogEntry[];
    fieldMinutes: number;
    creditMinutes: number;
    reportHours: number;
  },
>(month: T, ops: LogOp[]): T & { pendingIds: string[] } {
  let entries = [...month.entries];
  const pendingIds: string[] = [];
  for (const op of ops) {
    if (op.type === 'delete') {
      entries = entries.filter((e) => e.id !== op.id);
      continue;
    }
    const inMonth = op.body.day.slice(0, 7) === month.month;
    entries = entries.filter((e) => e.id !== op.id);
    if (inMonth) {
      entries.push({
        id: op.id,
        day: op.body.day,
        minutes: op.body.minutes,
        kind: op.body.kind,
        note: op.body.note ?? null,
      });
      pendingIds.push(op.id);
    }
  }
  entries.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1));
  const fieldMinutes = entries.filter((e) => e.kind === 'field').reduce((s, e) => s + e.minutes, 0);
  const creditMinutes = entries.filter((e) => e.kind === 'credit').reduce((s, e) => s + e.minutes, 0);
  return {
    ...month,
    entries,
    fieldMinutes,
    creditMinutes,
    reportHours: reportHoursOf(fieldMinutes),
    pendingIds,
  };
}

/** The same rule as the server's: down to whole hours, a started first hour counted. */
export function reportHoursOf(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  return Math.floor(minutes / 60);
}
