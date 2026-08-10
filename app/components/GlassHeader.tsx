import React from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../lib/header';

/**
 * A header the content passes UNDER, rather than stops at.
 *
 * The bar has been flat and opaque since July: correct, brand-coloured, and
 * with a hard line where the list ended. What a reader loses to that is the
 * sense of a layer — a list scrolled to the top and a list scrolled halfway
 * look exactly alike at the top edge.
 *
 * So the content runs beneath a blurred bar of the same colour. Not a
 * decoration: the smear of whatever is passing underneath is what says «there
 * is more above», which a flat bar cannot say at all.
 *
 * WHY THIS NEEDS A NEW BUILD: real blur is a native module. There is a JS trick
 * with a translucent colour, and it looks like a translucent colour — the
 * content behind stays sharp and the whole thing reads as a mistake rather than
 * as glass. Given that the build was happening anyway, the honest version won.
 *
 * The LARGE TITLE lives here too, and only on the screens a person arrives at
 * from the tab bar. On a nested screen it would eat a centimetre of a list he
 * came to read; at the root, where the screen opens from nothing, it is the
 * heading of the page.
 */

/** Bar height without the status bar, in each of its two shapes. */
export const GLASS_HEADER_COMPACT = 52;
export const GLASS_HEADER_LARGE = 92;

export function GlassHeader({
  title,
  large,
  left,
  right,
  /**
   * How far the list beneath has travelled. The bar carries no shadow at the
   * very top — there is nothing above yet, and a shadow there would be a
   * promise of content that does not exist.
   */
  scrollY,
}: {
  title: React.ReactNode;
  large?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  scrollY?: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const height = (large ? GLASS_HEADER_LARGE : GLASS_HEADER_COMPACT) + insets.top;

  const elevation = scrollY
    ? scrollY.interpolate({
        inputRange: [0, 24],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : new Animated.Value(1);

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <BlurView
        intensity={Platform.OS === 'android' ? 60 : 40}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {/* The brand colour over the blur, not instead of it: without the tint the
          bar takes the colour of whatever scrolls beneath and stops being ours. */}
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <Animated.View
        style={[styles.shadow, { opacity: elevation, width }]}
        pointerEvents="none"
      />
      <View style={[styles.row, { paddingTop: insets.top }, large && styles.rowLarge]}>
        <View style={styles.side}>{left}</View>
        <View style={large ? styles.titleLarge : styles.titleWrap}>
          {typeof title === 'string' ? (
            <Text
              numberOfLines={1}
              style={large ? styles.textLarge : styles.text}
            >
              {title}
            </Text>
          ) : (
            title
          )}
        </View>
        <View style={styles.side}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  // 0.82 rather than solid: enough of the passing content shows through to read
  // as glass, not so much that white text loses its footing.
  tint: { backgroundColor: BRAND, opacity: 0.82 },
  shadow: {
    position: 'absolute',
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(8,60,74,0.45)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  rowLarge: { alignItems: 'flex-end', paddingBottom: 14 },
  side: { minWidth: 36, justifyContent: 'center' },
  titleWrap: { flex: 1 },
  titleLarge: { flex: 1, paddingBottom: 2 },
  text: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.3,
  },
  textLarge: {
    color: '#ffffff',
    fontSize: 26,
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: -0.6,
  },
});
