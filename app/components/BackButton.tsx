import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Header back button that never gets stuck. On web the navigation stack can be
 * empty after a refresh or a deep link, so the default back arrow (which calls
 * goBack()) does nothing. This goes back when there is history, otherwise it
 * replaces to a sensible parent route.
 */
export function BackButton({ fallback }: { fallback: string }) {
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
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
