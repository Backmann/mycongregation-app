import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { SECTION_COLORS, SectionKind } from '../lib/section-colors';

/**
 * A small neon dot marking something that belongs to the signed-in publisher —
 * the calm replacement for the old bulb icon. A soft halo breathes around a
 * solid core (opacity + scale only, so it runs on the native driver).
 *
 * `color` lets the week drawer distinguish the kind of assignment; everywhere
 * else it keeps the amber of the row glow.
 */
export function MyDot({
  size = 9,
  kind = 'meeting',
  color,
}: {
  /** Diameter of the solid core; the halo adds ~10px around it. */
  size?: number;
  /** Section the marked row belongs to — decides the dot's colour. */
  kind?: SectionKind;
  /** Explicit colour, when the caller isn't tied to a section. */
  color?: string;
}) {
  const tone = color ?? SECTION_COLORS[kind].color;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const halo = size + 10;
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.18],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.42],
  });

  return (
    <View
      style={{
        width: halo,
        height: halo,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          backgroundColor: tone,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone,
        }}
      />
    </View>
  );
}
