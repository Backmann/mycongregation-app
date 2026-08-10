import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../lib/header';

/**
 * Frosted, and the same all the way down.
 *
 * THE MISTAKE THIS REPLACES was mine and it was in the reasoning, not the
 * numbers: I made the bar translucent AT REST and solid ONCE SCROLLED. But at
 * rest there is nothing beneath it — the list starts below the bar, so what
 * would be blurred is blank background. And the moment content does pass
 * underneath, which is the only moment glass means anything, I was closing the
 * material to 0.95. The effect could never appear, at any setting.
 *
 * So the material is now CONSTANT, and legibility is bought with blur instead
 * of with opacity. That is how it works on a tablet too: the veil is not very
 * opaque, but the blur is strong enough that what passes below becomes a wash
 * of colour rather than shapes, and white letters sit on it cleanly.
 *
 * TWO THINGS THE MODULE DOES that had to be accounted for:
 *   — on the web the blur radius is intensity × 0.2 pixels, so the 45 I had set
 *     was nine pixels: enough to soften an edge, not enough to dissolve text.
 *     It is at maximum now, twenty pixels.
 *   — BlurView lays down a veil of its OWN, keyed to the tint. 'dark' is nearly
 *     black at high intensity, which is what made the bar muddy under our teal.
 *     'default' is a light one, so the brand colour stays a brand colour.
 *   — on Android nothing blurs at all without experimentalBlurMethod.
 */

export const GLASS_HEADER_LARGE = 74;
export const GLASS_HEADER_COMPACT = 50;

/** How far the list travels before the bar is fully gathered. */
export const COLLAPSE_DISTANCE = 56;

/** Falling opacities: a soft edge built from hairlines. */
const SHADOW_LAYERS = [
  { height: 1, color: 'rgba(8,60,74,0.14)' },
  { height: 2, color: 'rgba(8,60,74,0.08)' },
  { height: 4, color: 'rgba(8,60,74,0.05)' },
  { height: 7, color: 'rgba(8,60,74,0.025)' },
];

export function GlassHeader({
  title,
  large,
  left,
  right,
  scrollY,
}: {
  title: React.ReactNode;
  large?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Position of the list beneath; without it the bar simply sits collapsed. */
  scrollY?: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const progress = scrollY ?? new Animated.Value(COLLAPSE_DISTANCE);
  const range = {
    inputRange: [0, COLLAPSE_DISTANCE],
    extrapolate: 'clamp' as const,
  };

  const height = large
    ? progress.interpolate({
        ...range,
        outputRange: [
          GLASS_HEADER_LARGE + insets.top,
          GLASS_HEADER_COMPACT + insets.top,
        ],
      })
    : new Animated.Value(GLASS_HEADER_COMPACT + insets.top);

  // Constant, and deliberately so — see the note above. 0.72 lets the blurred
  // wash through; the strong blur is what keeps white text readable over it.
  const tint = new Animated.Value(0.72);

  const shadow = progress.interpolate({ ...range, outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <BlurView
        // Maximum: on the web this is the blur RADIUS in disguise (intensity ×
        // 0.2 px), and anything less leaves shapes legible behind the letters.
        intensity={100}
        // 'default' is a light veil; 'dark' is nearly black at this strength
        // and turned our teal to mud.
        tint="default"
        // Android draws nothing at all without this, which is why the phone
        // showed a flat bar while the browser showed a blurred one.
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.tint, { opacity: tint }]}
      />
      <View style={[styles.row, { paddingTop: insets.top }]}>
        {left ? <View style={styles.side}>{left}</View> : null}
        <View style={styles.titleWrap}>{title}</View>
        {right ? <View style={styles.side}>{right}</View> : null}
      </View>
      <Animated.View
        style={[styles.shadowStack, { opacity: shadow }]}
        pointerEvents="none"
      >
        {SHADOW_LAYERS.map((layer, i) => (
          <View
            key={i}
            style={{ height: layer.height, backgroundColor: layer.color }}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  tint: { backgroundColor: BRAND },
  shadowStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -14,
    height: 14,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  side: { justifyContent: 'center' },
  titleWrap: { flex: 1, justifyContent: 'center' },
});
