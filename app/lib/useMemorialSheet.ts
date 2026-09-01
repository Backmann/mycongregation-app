import { useQuery } from '@tanstack/react-query';
import { memorialApi, MemorialSheet } from './api';

/**
 * The Memorial sheet, asked for in ONE way.
 *
 * Two parts of the week screen read it: the Memorial block, which shows the
 * programme, and the duties section, which shows the duties of that evening
 * beside the ordinary ones. They are far apart in the tree and neither knows
 * about the other.
 *
 * That is exactly the shape of the fault we spent an evening on with
 * `['publishers','all']`: one key, several `useQuery` calls, and whichever
 * mounted first decided what everyone else read. React Query caches by key,
 * not by function — so the call lives here, once, and both ask it by name.
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
