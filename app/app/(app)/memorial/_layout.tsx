import { Stack } from 'expo-router';
import { headerOptions } from '../../../lib/header';

/**
 * The Memorial programme is reached from the event that holds it, so the
 * screen sets its own title and back button and this only carries the shared
 * header styling.
 */
export default function MemorialLayout() {
  return <Stack screenOptions={headerOptions} />;
}
