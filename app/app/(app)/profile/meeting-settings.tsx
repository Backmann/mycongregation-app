import { Redirect } from 'expo-router';

/**
 * Moved to the Congregation tab (step 3b, 22 September): meeting times and
 * the halls are one screen now, /publishers/meeting-settings. This address
 * stays alive for bookmarks; no notification leads here.
 */
export default function Moved() {
  return <Redirect href={'/publishers/meeting-settings' as never} />;
}
