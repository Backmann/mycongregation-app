import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import {
  keptIdentity as pickIdentity,
  keptName,
  mondayOf,
  pruneKept,
  rangeSpan,
  rowsFromEarlierPiece,
  type KeptEntry,
  type KeptIdentity,
} from './offline-keep-rules';

/**
 * Keeping the last good answers on the device — the moving parts.
 * WHAT is kept, and why nothing else, is lib/offline-keep-rules.ts.
 *
 * AsyncStorage, not lib/storage.ts: the secure store holds keys and a few
 * bytes about the person, and refuses values of this size on a phone. What
 * is kept here is what any publisher of the congregation is shown anyway.
 *
 * Kept for ONE person: written under his id, given back only to him, and
 * wiped when he signs out, when the server refuses his session, and when
 * somebody else signs in on this device.
 */
const STORE_KEY = 'mycongregation.kept';
const VERSION = 1;
/** A write is put off by this much, so a screen of ten answers is one write. */
const WRITE_DELAY_MS = 1500;
/** Larger than this is not kept at all — a phone's store has its limits. */
const MAX_BYTES = 2_000_000;

interface Stored {
  v: number;
  userId: string;
  entries: Record<string, KeptEntry>;
  me: KeptIdentity | null;
}

let current: Stored | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s || s.v !== VERSION || typeof s.userId !== 'string' || typeof s.entries !== 'object') return null;
    return s;
  } catch {
    return null;
  }
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const s = current;
    if (!s) return;
    try {
      const raw = JSON.stringify(s);
      if (raw.length > MAX_BYTES) return;
      void AsyncStorage.setItem(STORE_KEY, raw).catch(() => {});
    } catch {
      // Not kept this time; the screens work as before.
    }
  }, WRITE_DELAY_MS);
}

/**
 * Put back what was kept for this person, before the first screen asks.
 *
 * Each answer goes back with the time it was GIVEN, so it counts as old: the
 * screen asks the server at once, and only when that fails is the kept answer
 * what stays on screen — under a line that says when it is from.
 */
export async function restoreKept(qc: QueryClient, userId: string): Promise<void> {
  const s = await readStored();
  if (!s || s.userId !== userId) {
    if (s) await forgetKept();
    current = { v: VERSION, userId, entries: {}, me: null };
    return;
  }
  const entries = pruneKept(s.entries, Date.now(), mondayOf(new Date()));
  current = { v: VERSION, userId, entries, me: s.me ?? null };
  for (const e of Object.values(entries)) {
    if (qc.getQueryData(e.key) === undefined) {
      // Kept for the whole session, not five minutes. A restored answer has
      // nobody looking at it until its screen opens — and the query cache
      // drops what nobody looks at after five minutes: the duties of the
      // programme, the meeting's own week, were gone by the time the brother
      // reached the hall (found 9 October 2026, from the library's code).
      qc.setQueryDefaults(e.key, { gcTime: Infinity });
      qc.setQueryData(e.key, e.data, { updatedAt: e.at });
      // Old by definition, however recent its time: a kept answer given
      // twenty seconds ago would otherwise count as fresh, never be asked
      // again, and stand on screen without the line that says what it is.
      void qc.invalidateQueries({ queryKey: e.key, exact: true, refetchType: 'none' });
    }
  }
}

/**
 * Keep every good answer of a kept query while this person is signed in.
 * Returns the way to stop.
 */
export function startKeeping(qc: QueryClient, userId: string): () => void {
  if (!current || current.userId !== userId) {
    // Signed in afresh (nothing was put back): start empty, and take over
    // what this same person kept before, so a write does not drop it.
    const fresh: Stored = { v: VERSION, userId, entries: {}, me: null };
    current = fresh;
    void readStored().then((s) => {
      if (!s || s.userId !== userId || current !== fresh) return;
      fresh.entries = { ...pruneKept(s.entries, Date.now(), mondayOf(new Date())), ...fresh.entries };
      fresh.me = fresh.me ?? s.me ?? null;
    });
  }
  const unsubscribe = qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const s = current;
    if (!s || s.userId !== userId) return;
    const { queryKey } = event.query;
    const { data, dataUpdatedAt } = event.query.state;
    if (data === undefined) return;
    if (queryKey.length === 1 && queryKey[0] === 'me-publisher') {
      // One's own card: who and which group, never the contacts on it.
      s.me = pickIdentity((data as { publisher?: unknown } | null)?.publisher);
      scheduleWrite();
      return;
    }
    const name = keptName(queryKey, mondayOf(new Date()));
    if (!name) return;
    s.entries[name] = { key: queryKey, data, at: dataUpdatedAt || Date.now() };
    scheduleWrite();
  });
  return () => {
    unsubscribe();
  };
}

/** Wipe everything kept on this device — at sign-out and the like. */
export async function forgetKept(): Promise<void> {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  current = null;
  try {
    await AsyncStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing kept, then.
  }
}

/** A new person signs in: what was kept for anybody else goes. */
export async function forgetKeptOfOthers(userId: string): Promise<void> {
  const s = current ?? (await readStored());
  if (s && s.userId !== userId) await forgetKept();
}

/**
 * Own card as kept — for the moment the server cannot be asked. Only who and
 * which group: the contact fields come back empty, so a screen that shows or
 * edits contacts must not use this (see useMyPublisher).
 */
export function keptMe(userId: string | undefined): KeptIdentity | null {
  return userId && current?.userId === userId ? current.me : null;
}

/**
 * The kept pieces of one kind of range («assignments», «duties», «cleaning»,
 * «field-service») — read from what is KEPT, not from the query cache: a
 * piece nobody is looking at leaves the cache after five minutes, and the
 * hall is often more than five minutes after the app was opened. The
 * programme comes wrapped ({ data: [...] }), the others as plain lists.
 */
export function keptPieces<T extends { weekStartDate: string }>(
  kind: string,
  userId: string | undefined,
): { from: string; to: string; rows: T[]; at: number }[] {
  if (!userId || current?.userId !== userId) return [];
  const out: { from: string; to: string; rows: T[]; at: number }[] = [];
  for (const e of Object.values(current.entries)) {
    const span = rangeSpan(e.key);
    if (!span || span.kind !== kind) continue;
    const data = e.data as unknown;
    const rows = Array.isArray(data)
      ? (data as T[])
      : Array.isArray((data as { data?: unknown } | null)?.data)
        ? (data as { data: T[] }).data
        : null;
    if (rows) out.push({ from: span.from, to: span.to, rows, at: e.at });
  }
  return out;
}

/**
 * The weeks [from, to) from an EARLIER kept piece — for a screen whose own
 * request (this Monday's piece) did not come. See rowsFromEarlierPiece.
 */
export function earlierPiece<T extends { weekStartDate: string }>(
  kind: string,
  userId: string | undefined,
  from: string,
  to: string,
): { rows: T[]; at: number; coveredTo: string } | null {
  return rowsFromEarlierPiece(keptPieces<T>(kind, userId), from, to);
}
