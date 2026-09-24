import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * The feed moved to /schedule itself when it became the «Программа» tab
 * (23 September). This address was only ever reached by typing it; it stays
 * for bookmarks and forwards with its query intact.
 */
export default function MovedFeed() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/schedule', params } as never} />;
}
