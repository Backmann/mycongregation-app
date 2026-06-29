import { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ITEM_H = 36;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * One column of the time picker. It can be changed four ways, so it feels
 * natural on every device:
 *   • mouse wheel / touchpad scroll (web `wheel` events)
 *   • drag up/down with finger or mouse (PanResponder — touch and web)
 *   • the ▲/▼ chevrons (click/tap)
 *   • tapping a visible value
 * Values wrap around like a real wheel.
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
  const n = values.length;
  const rootRef = useRef<View>(null);
  // Keep the latest state in a ref so the wheel/drag handlers (created once)
  // never read stale values.
  const stateRef = useRef({ index, n, onIndex });
  stateRef.current = { index, n, onIndex };

  const step = useCallback((dir: number) => {
    const s = stateRef.current;
    s.onIndex((((s.index + dir) % s.n) + s.n) % s.n);
  }, []);

  // Mouse wheel / touchpad (web only).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = rootRef.current as unknown as {
      addEventListener?: (t: string, h: (e: WheelEvent) => void, o?: unknown) => void;
      removeEventListener?: (t: string, h: (e: WheelEvent) => void) => void;
    } | null;
    if (!node || !node.addEventListener) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      let guard = 0;
      while (Math.abs(acc) >= 50 && guard < 4) {
        step(acc > 0 ? 1 : -1);
        acc += acc > 0 ? -50 : 50;
        guard += 1;
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener?.('wheel', onWheel);
  }, [step]);

  // Drag with finger or mouse (touch + web).
  const dragRef = useRef(0);
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 4 && Math.abs(g.dy) >= Math.abs(g.dx),
      onPanResponderGrant: () => {
        dragRef.current = 0;
      },
      onPanResponderMove: (_e, g) => {
        const target = Math.round(-g.dy / ITEM_H);
        let delta = target - dragRef.current;
        while (delta !== 0) {
          step(delta > 0 ? 1 : -1);
          delta += delta > 0 ? -1 : 1;
        }
        dragRef.current = target;
      },
    }),
  ).current;

  const at = (off: number) => (((index + off) % n) + n) % n;

  return (
    <View ref={rootRef} style={styles.col}>
      <Pressable
        onPress={() => step(-1)}
        hitSlop={8}
        style={styles.chev}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-up" size={20} color="#94a3b8" />
      </Pressable>

      <View style={styles.window} {...responder.panHandlers}>
        <View style={styles.band} pointerEvents="none" />
        {[-2, -1, 0, 1, 2].map((off) => {
          const i = at(off);
          const dist = Math.abs(off);
          return (
            <Pressable
              key={off}
              onPress={() => onIndex(i)}
              style={styles.item}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.text,
                  dist === 0 && styles.active,
                  dist === 1 && styles.near,
                  dist >= 2 && styles.far,
                ]}
              >
                {pad2(values[i])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => step(1)}
        hitSlop={8}
        style={styles.chev}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-down" size={20} color="#94a3b8" />
      </Pressable>
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

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = BASE_MINUTES.includes(min)
    ? BASE_MINUTES
    : [...BASE_MINUTES, min].sort((a, b) => a - b);

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
        index={minutes.indexOf(min)}
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
    paddingVertical: 4,
  },
  col: { alignItems: 'center', width: 80 },
  chev: { height: 28, alignItems: 'center', justifyContent: 'center' },
  window: { height: ITEM_H * 5, justifyContent: 'center' },
  band: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: ITEM_H * 2,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 20, fontVariant: ['tabular-nums'], color: '#94a3b8' },
  active: { color: '#0c4a6e', fontWeight: '700', fontSize: 24 },
  near: { color: '#64748b', fontSize: 18 },
  far: { color: '#cbd5e1', fontSize: 16 },
  colon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4a6e',
    marginHorizontal: 2,
  },
});
