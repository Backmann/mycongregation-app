import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Moved to the Congregation tab: /publishers/backups (step 3a, 22 September).
 *
 * This address stays alive for bookmarks and anything still pointing here,
 * and forwards with its query intact. No notification leads here — checked
 * against lib/push-notifications.ts and the service worker.
 */
export default function Moved() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/publishers/backups', params } as never} />;
}
