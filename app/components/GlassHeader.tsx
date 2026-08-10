import React from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../lib/header';

/**
 * A header that starts tall and gathers itself as the list moves.
 *
 * The first attempt was tall and STAYED tall, and it read as a slab: ninety
 * points of brand colour holding two words, with a smear of half-seen content
 * above them. What was missing is the part that makes this shape work
 * elsewhere — the title is large only while there is nothing to read yet, and
 * shrinks into an ordinary bar the moment the list starts moving. Height is the
 * most expensive material on a phone and it belongs to the content.
 *
 * So: 74 points at rest, 50 once you have scrolled, continuous rather than a
 * jump.
 *
 * ON THE GLASS. Blur alone is not the effect; blur PLUS a strong tint is. At
 * 0.82 the passing content showed through as mud — sharp shapes ghosting behind
 * white letters, which is what made it look broken rather than frosted. The
 * tint now rests at 0.90 and closes to 0.97 as the bar collapses, so the
 * material reads as frosted and white text keeps its footing all the way down.
 *
 * The shadow is a real one, cast outside the bar, and it arrives WITH the
 * collapse: at the top of a list there is nothing above to cast it.
 */

export const GLASS_HEADER_LARGE = 74;
export const GLASS_HEADER_COMPACT = 50;

/** How far the list travels before the bar is fully gathered. */
export const COLLAPSE_DISTANCE = 56;

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

  const tint = large
    ? progress.interpolate({ ...range, outputRange: [0.9, 0.97] })
    : new Animated.Value(0.95);

  const shadow = progress.interpolate({ ...range, outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <BlurView
        intensity={Platform.OS === 'ios' ? 30 : 24}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.tint, { opacity: tint }]}
      />
      <Animated.View
        style={[styles.shadow, { opacity: shadow }]}
        pointerEvents="none"
      />
      <View style={[styles.row, { paddingTop: insets.top }]}>
        {left ? <View style={styles.side}>{left}</View> : null}
        <View style={styles.titleWrap}>{title}</View>
        {right ? <View style={styles.side}>{right}</View> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  tint: { backgroundColor: BRAND },
  /**
   * Cast downwards and OUTSIDE the bar. A shadow drawn inside its own box is a
   * grey stripe; this one sits just below the edge and shows only what spills.
   */
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -14,
    height: 14,
    shadowColor: '#083c4a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
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
