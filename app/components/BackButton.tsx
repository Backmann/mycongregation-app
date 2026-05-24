import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Header back button that never gets stuck.
 *
 * - default: go back when there is history, otherwise replace to `fallback`.
 * - toParent: always go to `fallback`. Use when a screen has one logical parent
 *   regardless of where it was opened from — e.g. a publisher card should always
 *   return to the publishers list, not to the schedule it was opened from.
 */
export function BackButton({
  fallback,
  toParent,
}: {
  fallback: string;
  toParent?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!toParent && router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallback as any);
        }
      }}
      style={{ paddingHorizontal: 12 }}
      hitSlop={8}
      accessibilityRole="button"
    >
      <Ionicons name="chevron-back" size={28} color="#0ea5e9" />
    </Pressable>
  );
}
