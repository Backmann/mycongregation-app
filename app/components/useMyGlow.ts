import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Shared "breathing" amber glow for schedule rows that belong to the signed-in
 * publisher (or their group). Returns animated backgroundColor + borderColor
 * that pulse between a barely-there tint and a warm amber, matching MyGlowRow.
 * Apply the values to any Animated component (Animated.View / an animated
 * Pressable). Colour animation can't use the native driver, but one slow loop
 * stays smooth. Enable/disable with `active` so non-mine rows pay no cost.
 */
export function useMyGlow(active: boolean) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) {
    return { backgroundColor: undefined, borderColor: undefined };
  }
  return {
    backgroundColor: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(245,158,11,0.06)', 'rgba(245,158,11,0.15)'],
    }),
    borderColor: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(245,158,11,0.18)', 'rgba(245,158,11,0.42)'],
    }),
  };
}
