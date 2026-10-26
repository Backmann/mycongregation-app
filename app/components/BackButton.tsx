import { router, useLocalSearchParams } from 'expo-router';
import { performBack } from './NavHistory';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

/**
 * The header's back arrow (19 October 2026): one step back in where the
 * person has been — lib/nav-history.ts says why and how. Within a section it
 * closes the screen; from a screen opened from another section it returns
 * there and closes the screen it leaves.
 *
 * `fallback` (or `?from=`, said by whoever opened the screen) is the screen's
 * parent, used only when there is no history to go back in — the app opened
 * right on this screen, from a notification say.
 *
 * Before, back always went to that parent, with a navigate that in React
 * Navigation 7 pushes a fresh copy of it: the stack grew, the home screen
 * showed a second, native arrow, and that arrow led back into the screen just
 * left. And an event opened from the home screen went back to the Programme.
 */
export function BackButton({
  fallback,
  toParent,
  color,
}: {
  fallback: string;
  /** Kept for the call sites; back follows the person's own way now (lib/nav-history.ts). */
  toParent?: boolean;
  color?: string;
}) {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t } = useTranslation();
  return (
    <Pressable
      // Named, so a screen reader says what it is — and the walkthrough script
      // presses THIS back, not the browser's, which follows tab history.
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      testID="header-back"
      onPress={() => {
        // One step back in where the person has been (lib/nav-history.ts):
        // within a section it closes the screen; from a screen opened from
        // another section it returns there. The screen's parent — said by
        // whoever opened it (`from`), or the section's own (`fallback`) — is
        // the answer only when there is no history: the app opened right here.
        if (!performBack(typeof from === 'string' && from ? from : fallback)) {
          router.replace(fallback as never);
        }
      }}
      style={{ paddingHorizontal: 12 }}
      hitSlop={8}
    >
      {/* The header is the brand colour now, so white is the default here.
          This button lives only in headers — nothing else uses it. */}
      <Ionicons name="chevron-back" size={28} color={color ?? '#ffffff'} />
    </Pressable>
  );
}
