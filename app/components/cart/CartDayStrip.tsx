import { StyleSheet, View } from 'react-native';
import type { CartDayView, CartSpan } from '../../lib/api';
import { barOf } from '../../lib/cart-time';

/**
 * A day at the stand as one strip (2 November 2026): its hours from left to
 * right, the time others stand or asked for in light green, the reader's own
 * in dark green, a part called off hatched in grey. Read at a glance where
 * the day is covered and where it is not.
 */
export function CartDayStrip({
  day,
  others,
  mine,
  height = 16,
}: {
  day: CartDayView;
  others: CartSpan[];
  mine: CartSpan[];
  height?: number;
}) {
  return (
    <View style={[styles.track, { height }]}>
      {others.map((s, i) => (
        <View key={`o${i}`} style={[styles.bar, styles.other, barOf(day, s)]} />
      ))}
      {mine.map((s, i) => (
        <View key={`m${i}`} style={[styles.bar, styles.mine, barOf(day, s)]} />
      ))}
      {day.cancellations.map((c) => (
        <View key={c.id} style={[styles.bar, styles.off, barOf(day, c)]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  bar: { position: 'absolute', top: 0, bottom: 0 },
  other: { backgroundColor: '#86efac', opacity: 0.85 },
  mine: { backgroundColor: '#15803d' },
  off: { backgroundColor: '#cbd5e1', opacity: 0.9 },
});
