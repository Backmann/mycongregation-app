import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { extractErrorMessage } from './api';
import type { PendingTick } from './division';
import { keepTick, sendTicks, waitingTicks } from './street-ticks';

/** How often ticks waiting on the phone are tried again. */
const RETRY_MS = 20 * 1000;

/**
 * Ticking a street on the spot (13 November 2026): the tick shows at once
 * and waits on the phone (lib/street-ticks.ts) until the server has it —
 * at once with a connection, later without one. A weak signal never holds
 * the list: nothing waits for an answer before the next tick.
 *
 * `send` returns the server's new state; `onSaved` puts it on the screen.
 */
export function useStreetTicks<T>(
  target: string | null,
  send: (key: string, walked: boolean) => Promise<T>,
  onSaved: (d: T) => void,
) {
  const [queue, setQueue] = useState<PendingTick[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The last try found no connection: only then is «ждёт связи» said.
  const [stuck, setStuck] = useState(false);
  const sendRef = useRef(send);
  const savedRef = useRef(onSaved);
  sendRef.current = send;
  savedRef.current = onSaved;
  // One sending at a time, so a tick is never sent twice; a call that comes
  // meanwhile asks for one more round.
  const running = useRef(false);
  const again = useRef(false);

  const flush = useCallback(async () => {
    if (!target) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        let last: T | null = null;
        const r = await sendTicks(target, async (t) => {
          last = await sendRef.current(t.key, t.walked);
        });
        setQueue(r.left);
        setStuck(r.left.length > 0);
        if (last !== null) savedRef.current(last);
        // Refused by the server: say why; the screen shows the server's state again.
        if (r.refused.length) setError(extractErrorMessage(r.refused[r.refused.length - 1]));
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    let gone = false;
    void waitingTicks(target).then((q) => {
      if (!gone) setQueue(q);
      if (q.length) void flush();
    });
    return () => {
      gone = true;
    };
  }, [target, flush]);

  // Waiting ticks are tried again now and then, and when the phone is back online.
  useEffect(() => {
    if (!target || queue.length === 0) return;
    const timer = setInterval(() => void flush(), RETRY_MS);
    const online = () => void flush();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', online);
    return () => {
      clearInterval(timer);
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', online);
    };
  }, [target, queue.length, flush]);

  const tick = useCallback(
    async (key: string, walked: boolean) => {
      if (!target) return;
      setError(null);
      setQueue(await keepTick(target, { key, walked, at: new Date().toISOString() }));
      void flush();
    },
    [target, flush],
  );

  return { queue, tick, busy: false, error, stuck };
}
