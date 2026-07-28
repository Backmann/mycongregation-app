import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Header back button that never gets stuck.
 *
 * - default: go back when there is history, otherwise replace to `fallback`.
 * - toParent: always navigate to `fallback` (its one logical parent),
 *   regardless of where it was opened from — e.g. a publisher card returns to
 *   the publishers list, service reports return to Service, special events to
 *   the schedule. Uses navigate() so the parent tab's stack is reused and the
 *   next back press behaves naturally instead of jumping to Home.
 */
/**
 * Where back should go, said by whoever opened the screen.
 *
 * A publisher card can be reached from the roster, from a service group, from
 * a report — and those live in different stacks, so the router's own history
 * is not a reliable answer: opening a publisher from a group switched stacks,
 * and going "back" landed in the whole congregation's roster.
 *
 * So the caller passes `?from=` and is obeyed. Explicit beats clever here: the
 * screen that navigated is the only one that knows where the person came from.
 */
export function BackButton({
  fallback,
  toParent,
  color,
}: {
  fallback: string;
  toParent?: boolean;
  color?: string;
}) {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return (
    <Pressable
      onPress={() => {
        if (typeof from === 'string' && from) {
          router.navigate(from as any);
        } else if (toParent && !router.canGoBack()) {
          // The logical parent, but only when there is no history to return
          // to. Going there ALWAYS was the old behaviour and it was wrong in
          // the ordinary case: open a service group, tap a publisher, press
          // back — and you landed in the whole congregation's roster instead
          // of the group you came from.
          //
          // The rule the original comment was defending still holds: never
          // dump the person on Home. That is what the fallback is for, and it
          // is reached only when the stack really is empty — arriving from a
          // notification, or a link opened cold.
          router.navigate(fallback as any);
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallback as any);
        }
      }}
      style={{ paddingHorizontal: 12 }}
      hitSlop={8}
      accessibilityRole="button"
    >
      {/* The header is the brand colour now, so white is the default here.
          This button lives only in headers — nothing else uses it. */}
      <Ionicons name="chevron-back" size={28} color={color ?? '#ffffff'} />
    </Pressable>
  );
}
