import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useMyGlow } from './useMyGlow';

/**
 * A premium "breathing" amber glow marking the schedule row that belongs to the
 * signed-in publisher. Wraps its children in an Animated.View whose background
 * and soft inner border pulse between a faint tint and warm amber — the calm
 * counterpart to the pulsing MyBulb. For non-View rows (e.g. a Pressable), use
 * the useMyGlow() hook directly on an animated component instead.
 */
export function MyGlowRow({
  children,
  style,
  radius = 12,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const { backgroundColor, borderColor } = useMyGlow(true);
  return (
    <Animated.View
      style={[
        styles.glow,
        { borderRadius: radius, backgroundColor, borderColor },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    borderWidth: 1,
  },
});
