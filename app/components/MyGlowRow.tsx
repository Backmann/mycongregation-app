import { Animated, LayoutChangeEvent, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useMyGlow } from './useMyGlow';
import { SectionKind } from '../lib/section-colors';

/**
 * A premium "breathing" amber glow marking the schedule row that belongs to the
 * signed-in publisher. Wraps its children in an Animated.View whose background
 * and soft inner border pulse between a faint tint and warm amber — the calm
 * counterpart to the pulsing MyDot. For non-View rows (e.g. a Pressable), use
 * the useMyGlow() hook directly on an animated component instead.
 */
export function MyGlowRow({
  children,
  style,
  radius = 12,
  kind = 'meeting',
  onLayout,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** Section this row belongs to — decides the glow's hue. */
  kind?: SectionKind;
  /** The row's own width, for a caller that lays it out by it. */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { backgroundColor, borderColor } = useMyGlow(true, kind);
  return (
    <Animated.View
      onLayout={onLayout}
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
