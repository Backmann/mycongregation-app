import { useQuery } from '@tanstack/react-query';
import { publishersApi, Publisher } from './api';
import { useAuth } from './auth';

/**
 * Resolves the publisher linked to the signed-in user (publisher.userId).
 * Fails silently for roles that cannot list the directory — consumers should
 * hide publisher-bound UI when myPublisher is null.
 */
export function useMyPublisher(): {
  myPublisher: Publisher | null;
  myPublisherId: string | null;
} {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['publishers', 'me-resolve'],
    queryFn: () => publishersApi.list({ limit: 1000 }),
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const myPublisher =
    data?.data?.find((p) => p.userId === user?.id) ?? null;
  return { myPublisher, myPublisherId: myPublisher?.id ?? null };
}
