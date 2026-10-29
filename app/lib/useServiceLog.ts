import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useAuth } from './auth';
import type { failsScreen } from './screen-failure';
import { serviceLogApi, type ServiceLogEntryInput } from './api';
import {
  enqueue,
  flush,
  initQueue,
  newEntryId,
  pendingOps,
  subscribeQueue,
  takeRefusals,
  withPending,
  type LogOp,
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
export function useLogQueue(): { ops: LogOp[]; refusals: string[] } {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;
  const [refusals, setRefusals] = useState<string[]>([]);
  useEffect(() => {
    if (!userId) return;
    void initQueue(userId);
    const unsub = subscribeQueue(() => {
      const r = takeRefusals();
      if (r.length) setRefusals(r);
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
  return { ops, refusals };
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
