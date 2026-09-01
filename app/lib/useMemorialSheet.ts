import { useQuery } from '@tanstack/react-query';
import { memorialApi, MemorialSheet } from './api';

/**
 * The Memorial sheet, asked for in ONE way.
 *
 * Only the Memorial block reads it today: the duties of that evening became
 * ORDINARY duties of a third kind of meeting, so the duties section reads them
 * from the same place as every other duty and needs nothing from here.
 *
 * The hook stays anyway. It was written when there were two readers, and the
 * lesson behind it holds: React Query caches by KEY, not by function, so one
 * key with several `useQuery` calls means whichever mounted first decides what
 * the others see — the fault we spent an evening on with `['publishers',
 * 'all']`. The next reader (the printed sheet, the attendance figure) asks by
 * name instead of writing a second call.
 *
 * `enabled` is honest about there being no Memorial that week: a week without
 * one asks for nothing at all.
 */
export const memorialKey = (specialEventId: string | null | undefined) =>
  ['memorial', specialEventId ?? null] as const;

export function useMemorialSheet(specialEventId: string | null | undefined) {
  return useQuery<MemorialSheet>({
    queryKey: memorialKey(specialEventId),
    queryFn: () => memorialApi.sheet(specialEventId!),
    enabled: !!specialEventId,
    // The sheet is edited by hand, line by line, and every change invalidates
    // it — so a stale window only costs a refetch nobody notices.
    staleTime: 60 * 1000,
  });
}
