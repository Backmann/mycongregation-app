import { useQuery } from '@tanstack/react-query';
import { meApi, MyPublisherLite } from './api';
import { useAuth } from './auth';

/**
 * Resolves the publisher linked to the signed-in user via GET /me/publisher.
 * Works for every role (no directory access required); returns null when no
 * publisher is linked to the login. Consumers should hide publisher-bound UI
 * when myPublisher is null.
 */
export function useMyPublisher(): {
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
  const myPublisher = data?.publisher ?? null;
  return { myPublisher, myPublisherId: myPublisher?.id ?? null };
}
