import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../lib/header';

/**
 * The header, and why it is no longer made of glass.
 *
 * Five rounds went into a frosted bar before the reason it could not work
 * turned up in the screen's own stylesheet: the list behind it is #f8fafc with
 * white cards on it. Blur shows a blurred copy of what is underneath — and a
 * blurred copy of near-white is near-white, moving or still. On a tablet the
 * effect lives because photographs and dark artwork pass beneath; here a
 * ledger passes beneath. No amount of tuning could have produced it, and the
 * colours were in the file the whole time.
 *
 * What DOES read as expensive on pale content is the part that was already
 * working, so the bar keeps it and drops the rest:
 *
 *   THE COLLAPSE — 74 points while there is nothing to read yet, 50 once the
 *   list moves, continuously. Height is the costliest material on a phone and
 *   this hands it back to the content as soon as there is content.
 *
 *   THE SHADOW — four hairlines of falling opacity rather than one box with an
 *   offset, which renders as a grey rib on the web. It arrives with the
 *   collapse: at the top of a list nothing is above to cast it.
 *
 *   THE EDGE — a white hairline at ten percent along the bottom of the bar.
 *   This is the small thing that separates a material from a painted strip on
 *   a solid colour, and unlike blur it works on any content at all.
 *
 * Dropping the blur also takes a native module out of the build and stops
 * Android recomputing a blur every frame for something invisible.
 */

export const APP_HEADER_LARGE = 74;
export const APP_HEADER_COMPACT = 50;

/** How far the list travels before the bar is fully gathered. */
export const COLLAPSE_DISTANCE = 56;

/** A soft edge built from hairlines — see the note above. */
const SHADOW_LAYERS = [
  { height: 1, color: 'rgba(8,60,74,0.16)' },
  { height: 2, color: 'rgba(8,60,74,0.09)' },
  { height: 4, color: 'rgba(8,60,74,0.05)' },
  { height: 7, color: 'rgba(8,60,74,0.025)' },
];

export function AppHeader({
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
          APP_HEADER_LARGE + insets.top,
          APP_HEADER_COMPACT + insets.top,
        ],
      })
    : new Animated.Value(APP_HEADER_COMPACT + insets.top);

  const shadow = progress.interpolate({ ...range, outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <View style={[styles.row, { paddingTop: insets.top }]}>
        {left ? <View style={styles.side}>{left}</View> : null}
        <View style={styles.titleWrap}>{title}</View>
        {right ? <View style={styles.side}>{right}</View> : null}
      </View>
      <View style={styles.edge} pointerEvents="none" />
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
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: BRAND,
  },
  /** Ten percent white: a lit edge, the thing a painted strip does not have. */
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
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
