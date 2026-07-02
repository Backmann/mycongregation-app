import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * A premium pulsing lightbulb marking schedule rows that involve the
 * signed-in publisher. Placed LEFT of the text it highlights. The bulb sits
 * inside a soft, animated halo: two concentric amber layers breathe in
 * counter-phase, so the light feels alive without stealing attention.
 * Native-driven transforms keep it smooth with many bulbs on screen.
 */
export function MyBulb({ size = 16 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const box = size + 12;
  const outer = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] }),
      },
    ],
  };
  const inner = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.25] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.85] }),
      },
    ],
  };
  const bulb = {
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }),
      },
    ],
  };

  return (
    <View style={[styles.wrap, { width: box, height: box }]}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: box,
            height: box,
            borderRadius: box / 2,
            backgroundColor: '#fbbf24',
          },
          outer,
        ]}
      />
      <Animated.View
        style={[
          styles.halo,
          {
            width: box * 0.66,
            height: box * 0.66,
            borderRadius: (box * 0.66) / 2,
            backgroundColor: '#fde047',
          },
          inner,
        ]}
      />
      <Animated.View style={bulb}>
        <Ionicons name="bulb" size={size} color="#f59e0b" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
});
