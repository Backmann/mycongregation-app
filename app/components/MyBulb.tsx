import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * A softly, continuously pulsing lightbulb placed on schedule rows that
 * involve the signed-in publisher (their part, duty, field-service conductor
 * slot, or their cleaning group). Native-driven opacity + scale, so it stays
 * smooth even with several on screen.
 */
export function MyBulb({ size = 16 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.08],
  });

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Ionicons name="bulb" size={size} color="#f59e0b" />
    </Animated.View>
  );
}
