import { useQuery } from '@tanstack/react-query';
import { meApi, MyPublisherLite } from './api';
import { useAuth } from './auth';
import { keptMe } from './offline-keep';

/**
 * Resolves the publisher linked to the signed-in user via GET /me/publisher.
 * Works for every role (no directory access required); returns null when no
 * publisher is linked to the login. Consumers should hide publisher-bound UI
 * when myPublisher is null.
 */
export function useMyPublisher(options?: {
  /**
   * When the server cannot be asked, the card kept on the device stands in
   * (lib/offline-keep.ts): who and which group, so «yours» is still marked in
   * a hall with no signal. Its contact fields are EMPTY — a screen that shows
   * or edits contacts passes false, or it would show «not given» for a
   * phone that is there.
   */
  kept?: boolean;
}): {
  myPublisher: MyPublisherLite | null;
  myPublisherId: string | null;
} {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const kept = data === undefined && options?.kept !== false ? keptMe(user?.id) : null;
  const myPublisher: MyPublisherLite | null =
    data?.publisher ??
    (kept
      ? {
          ...kept,
          mobilePhone: null,
          email: null,
          address: null,
          contactsConfirmedAt: null,
          contactsConfirmedByUserId: null,
          contactsConfirmedByName: null,
        }
      : null);
  return { myPublisher, myPublisherId: myPublisher?.id ?? null };
}
