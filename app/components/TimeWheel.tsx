import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ITEM_H = 36;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * One column of the time picker. Click a visible value or the chevrons to
 * change it — no scroll gestures, so it works the same with a mouse on the
 * web and with touch on a phone. Values wrap around (a real wheel).
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
  const at = (offset: number) => (((index + offset) % n) + n) % n;

  return (
    <View style={styles.col}>
      <Pressable
        onPress={() => onIndex(at(-1))}
        hitSlop={8}
        style={styles.chev}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-up" size={20} color="#94a3b8" />
      </Pressable>

      <View style={styles.window}>
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
        onPress={() => onIndex(at(1))}
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

  // Empty/invalid → a sensible default, just once, so the wheel and the stored
  // value never disagree. Existing exact minutes are preserved.
  useEffect(() => {
    if (!m) onChange(`${pad2(h)}:${pad2(min)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  // Keep a non-5 minute selectable until the user moves off it.
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
