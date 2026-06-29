import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

const ITEM_H = 40;
const VISIBLE = 5; // odd number; the middle row is the selection
const VIEW_H = ITEM_H * VISIBLE;
const PAD = (VIEW_H - ITEM_H) / 2;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function Column({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const ref = useRef<ScrollView>(null);

  // Position on mount (web needs a tick after layout).
  useEffect(() => {
    const id = setTimeout(
      () => ref.current?.scrollTo({ y: selected * ITEM_H, animated: false }),
      0,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep aligned if the value changes from outside.
  useEffect(() => {
    ref.current?.scrollTo({ y: selected * ITEM_H, animated: true });
  }, [selected]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_H)));
    if (idx !== selected) onSelect(idx);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.col}
      contentContainerStyle={{ paddingVertical: PAD }}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
    >
      {values.map((v, i) => {
        const dist = Math.abs(i - selected);
        return (
          <View key={v} style={styles.item}>
            <Text
              style={[
                styles.itemText,
                dist === 0 && styles.itemActive,
                dist === 1 && styles.itemNear,
                dist >= 2 && styles.itemFar,
              ]}
            >
              {v}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

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

  // Normalise an empty/invalid value to a sensible default once, so the wheel
  // and the stored value never disagree.
  useEffect(() => {
    if (!m) onChange(`${pad2(h)}:${pad2(min)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => pad2(i));
  const minutes = Array.from({ length: 60 }, (_, i) => pad2(i));

  return (
    <View style={styles.wrap}>
      <View style={styles.band} pointerEvents="none" />
      <View style={styles.fadeTop} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none" />
      <Column
        values={hours}
        selected={h}
        onSelect={(i) => onChange(`${pad2(i)}:${pad2(min)}`)}
      />
      <Text style={styles.colon}>:</Text>
      <Column
        values={minutes}
        selected={min}
        onSelect={(i) => onChange(`${pad2(h)}:${pad2(i)}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: VIEW_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    position: 'relative',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_H,
    backgroundColor: 'transparent',
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_H,
    backgroundColor: 'transparent',
  },
  col: { height: VIEW_H, width: 72 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 22, fontVariant: ['tabular-nums'], color: '#94a3b8' },
  itemActive: { color: '#0c4a6e', fontWeight: '700', fontSize: 24 },
  itemNear: { color: '#64748b', fontSize: 20 },
  itemFar: { color: '#cbd5e1', fontSize: 18 },
  colon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4a6e',
    marginHorizontal: 2,
  },
});
