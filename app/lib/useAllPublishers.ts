import { useQuery } from '@tanstack/react-query';
import { Paginated, Publisher, publishersApi } from './api';

/**
 * The whole roster, asked for in ONE way.
 *
 * The key ['publishers','all'] was shared by nine screens, but the FUNCTION
 * behind it was not: three of them called `list({})`, which takes the server's
 * default of fifty, and six called `list({ limit: 200 })`. React Query caches
 * by key, not by function, so whichever screen mounted first decided how many
 * people the cache held — and every other screen then read that. Open «Задачи»
 * first and the person picker on an assignment offered fifty candidates
 * instead of everyone, silently; open it later and the same picker offered all
 * of them. That is the shape of «человека нет в списке, а через минуту есть»,
 * and no check could see it: both calls are valid, and the disagreement only
 * exists at run time, between two files that never mention each other.
 *
 * So the call lives here, once, and the screens ask for it by name.
 */

/**
 * The SERVER'S ceiling, not a preference: QueryPublishersDto caps `limit` at
 * 200 and rejects anything larger with a 400 — which is how the absence form
 * (limit 1000) and the group report (limit 500) came to show nobody at all.
 *
 * Why this does not page past it. `publicRosterPage` drops students AFTER the
 * page has been cut, so a non-privileged reader gets fewer than 200 rows back
 * from a full slice of 200, and the `total` it reports is corrected only by
 * the students on THAT page. An offset advanced by the rows we received would
 * therefore re-read some and skip none; one advanced by 200 could not tell the
 * end of the list from a page that happened to be all students. Paging safely
 * needs the server to redact BEFORE it paginates — until then, a loop here
 * would be guesswork wearing the clothes of a fix.
 *
 * Today's congregation is well under this. `total` comes back untouched on the
 * result, so a caller that wants to know whether it is reading everything can
 * compare it against `data.length` rather than assume.
 */
const PAGE = 200;

export const ALL_PUBLISHERS_KEY = ['publishers', 'all'] as const;

export function useAllPublishers(options?: { enabled?: boolean }) {
  return useQuery<Paginated<Publisher>>({
    queryKey: ALL_PUBLISHERS_KEY,
    queryFn: () => publishersApi.list({ limit: PAGE }),
    enabled: options?.enabled ?? true,
    // One number for every reader of this key. It was 60s where somebody had
    // thought about it and unset everywhere else; with a shared cache entry
    // the shortest one won anyway, so the thinking was being discarded.
    staleTime: 60 * 1000,
  });
}
