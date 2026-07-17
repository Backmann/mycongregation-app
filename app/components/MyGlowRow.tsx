import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

/**
 * A premium "breathing" amber glow marking the schedule row that belongs to the
 * signed-in publisher. The background and a soft inner border pulse between a
 * barely-there tint and a warm amber, so the row feels alive without stealing
 * attention — the calm counterpart to the pulsing MyBulb. Colour animation
 * can't use the native driver, but a single slow loop stays smooth.
 */
export function MyGlowRow({
  children,
  style,
  radius = 12,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, [pulse]);

  const backgroundColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(245,158,11,0.06)', 'rgba(245,158,11,0.15)'],
  });
  const borderColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(245,158,11,0.18)', 'rgba(245,158,11,0.42)'],
  });

  return (
    <Animated.View
      style={[
        styles.glow,
        { borderRadius: radius, backgroundColor, borderColor },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    borderWidth: 1,
  },
});
