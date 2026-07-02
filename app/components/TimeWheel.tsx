import { useEffect, useMemo, useRef } from 'react';
import type { ScrollView as RNScrollView } from 'react-native';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const ITEM_H = 36;
const VISIBLE = 5; // odd number of rows in the window
const PAD = (ITEM_H * (VISIBLE - 1)) / 2;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * One iOS-style wheel column: a real momentum ScrollView that snaps to the
 * nearest value, with the classic drum look — the centered value is large and
 * dark, neighbours fade, scale down and tilt away. Works with touch drag,
 * trackpad/mouse wheel (native browser scrolling) and tapping a value.
 */
function Column({
  values,
  index,
  onIndex,
}: {
  values: number[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const scrollRef = useRef<RNScrollView>(null);
  const scrollY = useRef(new Animated.Value(index * ITEM_H)).current;
  // The index we last reported (or were given) — used to tell our own snap
  // scrolls apart from an external value change.
  const currentRef = useRef(index);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIndexRef = useRef(onIndex);
  onIndexRef.current = onIndex;
  const countRef = useRef(values.length);
  countRef.current = values.length;

  // Initial position + external value changes.
  useEffect(() => {
    if (index === currentRef.current) return;
    currentRef.current = index;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: index * ITEM_H, animated: false });
    });
  }, [index]);
  useEffect(() => {
    // First mount: place the wheel on the current value.
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: currentRef.current * ITEM_H,
        animated: false,
      });
    });
  }, []);

  const settle = (offsetY: number) => {
    const max = (countRef.current - 1) * ITEM_H;
    const clamped = Math.max(0, Math.min(max, offsetY));
    const idx = Math.round(clamped / ITEM_H);
    if (idx !== currentRef.current) {
      currentRef.current = idx;
      onIndexRef.current(idx);
    }
    if (Math.abs(clamped - idx * ITEM_H) > 0.5 || clamped !== offsetY) {
      scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: true });
    }
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
        const y = e.nativeEvent.contentOffset.y;
        // Debounced snap: fires once scrolling (incl. web inertia) goes quiet.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => settle(y), 140);
      },
    },
  );

  const tapTo = (i: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    currentRef.current = i;
    onIndexRef.current(i);
    scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
  };

  return (
    <View style={styles.window}>
      <Animated.ScrollView
        ref={scrollRef as never}
        style={styles.scroll}
        contentContainerStyle={{ paddingVertical: PAD }}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={Platform.OS === 'web' ? undefined : ITEM_H}
        onScroll={onScroll}
        onMomentumScrollEnd={(e) => {
          if (timerRef.current) clearTimeout(timerRef.current);
          settle(e.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {values.map((v, i) => {
          const center = i * ITEM_H;
          const inputRange = [
            center - ITEM_H * 2,
            center - ITEM_H,
            center,
            center + ITEM_H,
            center + ITEM_H * 2,
          ];
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.25, 0.45, 1, 0.45, 0.25],
            extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.78, 0.88, 1.12, 0.88, 0.78],
            extrapolate: 'clamp',
          });
          const rotateX = scrollY.interpolate({
            inputRange,
            outputRange: ['48deg', '26deg', '0deg', '-26deg', '-48deg'],
            extrapolate: 'clamp',
          });
          return (
            <Pressable
              key={i}
              onPress={() => tapTo(i)}
              accessibilityRole="button"
            >
              <Animated.View
                style={[
                  styles.item,
                  {
                    opacity,
                    transform: [{ perspective: 600 }, { rotateX }, { scale }],
                  },
                ]}
              >
                <Text style={styles.text}>{pad2(v)}</Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.ScrollView>

      {/* iOS-style selection band + soft fade toward the edges. */}
      <View style={styles.band} pointerEvents="none" />
      <View style={[styles.fade, styles.fadeTop]} pointerEvents="none" />
      <View style={[styles.fade, styles.fadeBottom]} pointerEvents="none" />
    </View>
  );
}

const BASE_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

export function TimeWheel({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  const h = m ? Math.max(0, Math.min(23, parseInt(m[1], 10))) : 10;
  const min = m ? Math.max(0, Math.min(59, parseInt(m[2], 10))) : 0;

  useEffect(() => {
    if (!m) onChange(`${pad2(h)}:${pad2(min)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(
    () =>
      BASE_MINUTES.includes(min)
        ? BASE_MINUTES
        : [...BASE_MINUTES, min].sort((a, b) => a - b),
    [min],
  );

  return (
    <View style={styles.wrap}>
      <Column
        values={hours}
        index={h}
        onIndex={(i) => onChange(`${pad2(hours[i])}:${pad2(min)}`)}
      />
      <Text style={styles.colon}>:</Text>
      <Column
        values={minutes}
        index={Math.max(0, minutes.indexOf(min))}
        onIndex={(i) => onChange(`${pad2(h)}:${pad2(minutes[i])}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingVertical: 6,
  },
  window: {
    height: ITEM_H * VISIBLE,
    width: 84,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  text: {
    fontSize: 21,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#0f172a',
  },
  band: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: PAD,
    height: ITEM_H,
    borderRadius: 10,
    backgroundColor: 'rgba(14,165,233,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.25)',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
  colon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4a6e',
    marginHorizontal: 4,
  },
});
