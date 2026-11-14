import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError } from 'axios';
import { addTick, type PendingTick } from './division';

/**
 * «Street walked» ticked without a connection (13 November 2026, «Пары на
 * участке»): out in the streets the signal comes and goes, and a tick must
 * not be lost or ticked twice. It waits on the phone, is shown as ticked at
 * once, and goes to the server as soon as it answers again.
 *
 * Kept per division or per part link, for the day it was ticked only: the
 * next day the division and its links are gone anyway. Nothing personal is
 * kept — a street key and a time.
 */
const STORE_KEY = 'mycongregation.ticks';

interface Stored {
  day: string;
  queues: Record<string, PendingTick[]>;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function read(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const s = raw ? (JSON.parse(raw) as Stored) : null;
    if (s && s.day === today() && s.queues && typeof s.queues === 'object') return s;
  } catch {
    // A store that cannot be read holds nothing.
  }
  return { day: today(), queues: {} };
}

async function write(s: Stored): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Best effort: the tick still shows until the screen closes.
  }
}

/** The ticks waiting for one division or one part link. */
export async function waitingTicks(target: string): Promise<PendingTick[]> {
  return (await read()).queues[target] ?? [];
}

export async function keepTick(target: string, tick: PendingTick): Promise<PendingTick[]> {
  const s = await read();
  s.queues[target] = addTick(s.queues[target] ?? [], tick);
  await write(s);
  return s.queues[target];
}

async function forget(target: string, key: string, at: string): Promise<PendingTick[]> {
  const s = await read();
  // Only the tick that was sent: a newer one of the same street stays.
  s.queues[target] = (s.queues[target] ?? []).filter((q) => !(q.key === key && q.at === at));
  if (s.queues[target].length === 0) delete s.queues[target];
  await write(s);
  return s.queues[target] ?? [];
}

/** No answer at all: no connection, not a refusal. */
export function noAnswer(e: unknown): boolean {
  return e instanceof AxiosError && !e.response;
}

/**
 * Sends what waits, oldest first. Stops at the first missing answer (still
 * no connection); a refusal drops that tick — the server said no, and the
 * screen shows the server's state again.
 */
export async function sendTicks(
  target: string,
  send: (t: PendingTick) => Promise<unknown>,
): Promise<{ left: PendingTick[]; sent: number; refused: unknown[] }> {
  let left = await waitingTicks(target);
  let sent = 0;
  const refused: unknown[] = [];
  for (const t of [...left]) {
    try {
      await send(t);
      sent += 1;
    } catch (e) {
      if (noAnswer(e)) break;
      refused.push(e);
    }
    left = await forget(target, t.key, t.at);
  }
  return { left, sent, refused };
}
