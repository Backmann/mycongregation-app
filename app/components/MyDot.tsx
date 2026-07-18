import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

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
  color = '#f59e0b',
}: {
  /** Diameter of the solid core; the halo adds ~10px around it. */
  size?: number;
  color?: string;
}) {
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
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
