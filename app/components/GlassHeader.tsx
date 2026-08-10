import React from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../lib/header';

/**
 * Frosted at rest, solid once the list is moving.
 *
 * TWO FAULTS OF MINE, both fixed here, and worth naming because neither was a
 * matter of taste:
 *
 *   1. On Android the blur is OFF unless it is asked for by name. Without
 *      `experimentalBlurMethod` the component draws a plain colour, so on a
 *      phone there was never any glass to look at — only a teal bar.
 *   2. On the web the blur worked and I painted over it. The tint sat at 0.90,
 *      which erases whatever is behind it. I had been treating the murk as too
 *      MUCH transparency when it was too LITTLE blur.
 *
 * AND THE CHOICE UNDER IT. True glass takes the colour of what passes beneath,
 * which would mean giving up the brand-coloured bar and darkening the text and
 * the status-bar icons with it. Lionel picked the middle: frosted brand while
 * the list is at rest, closing to nearly solid as it moves. The material shows
 * itself in motion — which is the only place it means anything — and the top of
 * the app stays unmistakably ours when there is something to read.
 *
 * The shadow is four thin layers rather than one thick box. A single view with
 * a shadow offset renders as a grey rib on the web, which is exactly what it
 * looked like; stacked hairlines of falling opacity read as a soft edge on
 * every platform and cost nothing.
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

  // 0.62 leaves the blur visible; 0.95 gives white text a solid footing once
  // there is content sliding underneath.
  const tint = large
    ? progress.interpolate({ ...range, outputRange: [0.62, 0.95] })
    : new Animated.Value(0.95);

  const shadow = progress.interpolate({ ...range, outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <BlurView
        intensity={Platform.OS === 'android' ? 55 : 45}
        tint="dark"
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
