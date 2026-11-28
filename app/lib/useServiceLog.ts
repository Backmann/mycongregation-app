import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useAuth } from './auth';
import type { failsScreen } from './screen-failure';
import { serviceLogApi, type ServiceLogEntryInput } from './api';
import {
  currentRefusals,
  dismissRefusal,
  enqueue,
  flush,
  initQueue,
  newEntryId,
  pendingOps,
  queueLoaded,
  subscribeQueue,
  subscribeRefusals,
  withPending,
  type LogOp,
  type Refusal,
} from './service-log-queue';

/** «1 ч 30 мин», «2 ч», «45 мин» — never «1,5 ч» (Lionel, 29 October 2026). */
export function formatDuration(minutes: number, t: TFunction): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return t('hoursLog.dur.hm', { h, m });
  if (h > 0) return t('hoursLog.dur.h', { h });
  return t('hoursLog.dur.m', { m });
}

/**
 * The unsent changes of the person signed in, and the moments to send them:
 * at once, when the app comes back to the front, when the browser is online
 * again, and every half minute while anything waits.
 */
export function useLogQueue(): { ops: LogOp[]; ready: boolean } {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    void initQueue(userId);
    const unsub = subscribeQueue(() => {
      void qc.invalidateQueries({ queryKey: ['service-log'] });
    });
    const kick = () => void flush(userId);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') kick();
    });
    const timer = setInterval(() => {
      if (pendingOps(userId).length) kick();
    }, 30_000);
    let off = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', kick);
      off = () => window.removeEventListener('online', kick);
    }
    return () => {
      unsub();
      app.remove();
      clearInterval(timer);
      off();
    };
  }, [userId, qc]);
  // Read as a store, so a change in the queue is always a new render.
  const ops = useSyncExternalStore(
    subscribeQueue,
    () => pendingOps(userId),
    () => pendingOps(userId),
  );
  const ready = useSyncExternalStore(
    subscribeQueue,
    () => queueLoaded(userId),
    () => queueLoaded(userId),
  );
  return { ops, ready };
}

/** Try to send what waits now; true when nothing is left. */
export function flushLog(userId: string): Promise<boolean> {
  return flush(userId);
}

/**
 * Entries the server would not keep, until the person closes each — the
 * same list on Home and on «Мой учёт часов».
 */
export function useLogRefusals(): { refusals: Refusal[]; dismiss: (id: string) => void } {
  const refusals = useSyncExternalStore(subscribeRefusals, currentRefusals, currentRefusals);
  return { refusals, dismiss: dismissRefusal };
}

/** «30 ноября · 1 ч» — which entry a refusal speaks of. */
export function refusalLabel(r: Refusal, lang: string, t: TFunction): string | null {
  if (!r.day) return null;
  const d = new Date(`${r.day}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' });
  return r.minutes ? `${d} · ${formatDuration(r.minutes, t)}` : d;
}

export function useLogMonth(
  month?: string,
  opts?: { throwOnError?: typeof failsScreen },
) {
  const { ops } = useLogQueue();
  const q = useQuery({
    queryKey: ['service-log', 'month', month ?? 'now'],
    queryFn: () => serviceLogApi.month(month),
    throwOnError: opts?.throwOnError,
  });
  const data = useMemo(() => (q.data ? withPending(q.data, ops) : undefined), [q.data, ops]);
  return { ...q, data };
}

export function useLogOverview() {
  const { ops } = useLogQueue();
  const q = useQuery({
    queryKey: ['service-log', 'overview'],
    queryFn: () => serviceLogApi.overview(),
    staleTime: 60_000,
  });
  const months = useMemo(
    () => (q.data ? q.data.months.map((m) => withPending(m, ops)) : undefined),
    [q.data, ops],
  );
  return { ...q, months };
}

/** Writing, changing and removing — all through the queue. */
export function useLogActions() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const write = useCallback(
    async (input: ServiceLogEntryInput, id?: string): Promise<string> => {
      const entryId = id ?? newEntryId();
      await enqueue(userId, { type: 'put', id: entryId, body: input });
      return entryId;
    },
    [userId],
  );
  const remove = useCallback(
    async (id: string) => {
      await enqueue(userId, { type: 'delete', id });
    },
    [userId],
  );
  return { write, remove };
}
