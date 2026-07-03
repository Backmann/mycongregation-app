import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * Interactive Kingdom Hall floor plan for the weekly window-washing rota,
 * traced from the congregation's floor-plan drawing. Pure RN views (no SVG
 * dependency): outer + interior walls are thin dark views with door gaps,
 * windows are rounded bars on the exterior walls.
 *
 * Layout (percent of the plan box, which is taller than wide):
 *  - Left exterior wall, top->bottom: 9 men's WC, 9 women's WC (two cabins),
 *    9 accessible WC, then 1, 2, 3 in the main hall.
 *  - Top wall: 8 foyer, 8 foyer, 8 kitchen.
 *  - Right exterior wall, top->bottom: 7 (by the kitchen), then 6, 5, 4.
 *  - Top-right is the kitchen; centre-top the foyer; centre/lower the main
 *    hall with the stage at the bottom wall.
 *
 * Selected window numbers glow with a soft MyBulb-style amber pulse. Numbers
 * 8 and 9 are groups of physical windows that toggle together.
 */

type Orientation = 'v' | 'h';

interface WindowDef {
  num: number;
  x: number;
  y: number;
  len: number;
  o: Orientation;
  labelKey?: string;
}

const THICK = 3;

const WINDOWS: WindowDef[] = [
  { num: 9, x: 0, y: 3, len: 10, o: 'v', labelKey: 'wcMen' },
  { num: 9, x: 0, y: 18.5, len: 8.5, o: 'v', labelKey: 'wcWomen' },
  { num: 9, x: 0, y: 44, len: 10, o: 'v', labelKey: 'wcAccessible' },
  { num: 1, x: 0, y: 71.5, len: 9.5, o: 'v' },
  { num: 2, x: 0, y: 84, len: 8, o: 'v' },
  { num: 3, x: 0, y: 95, len: 4.6, o: 'v' },
  { num: 8, x: 28, y: 0, len: 16, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 47.5, y: 0, len: 16, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 67, y: 0, len: 16, o: 'h', labelKey: 'kitchen' },
  { num: 7, x: 100, y: 35.5, len: 16.5, o: 'v' },
  { num: 6, x: 100, y: 71.5, len: 9.5, o: 'v' },
  { num: 5, x: 100, y: 84, len: 8.5, o: 'v' },
  { num: 4, x: 100, y: 95, len: 4.6, o: 'v' },
];

const WT = 1.4;
const WALLS: { x: number; y: number; w: number; h: number }[] = [
  { x: 0, y: 15.7, w: 24.3, h: WT },
  { x: 24.3 - WT, y: 5, w: WT, h: 10.7 },
  { x: 0, y: 31.4, w: 34.6, h: WT },
  { x: 34.6 - WT, y: 15.7, w: WT, h: 15.7 },
  { x: 0, y: 40, w: 19.6, h: WT },
  { x: 19.6 - WT, y: 40, w: WT, h: 18.6 },
  { x: 0, y: 58.6, w: 34.6, h: WT },
  { x: 61.7, y: 15.7, w: WT, h: 41.4 },
  { x: 61.7, y: 57.1, w: 27.1, h: WT },
  { x: 97.2, y: 57.1, w: 2.8, h: WT },
];

function Halo({ size }: { size: number }) {
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

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.halo,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          top: -size / 2,
          left: -size / 2,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.16, 0.42],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.85, 1.25],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function WindowBar({
  def,
  active,
  editable,
  onToggle,
}: {
  def: WindowDef;
  active: boolean;
  editable: boolean;
  onToggle?: (num: number) => void;
}) {
  const { t } = useTranslation();
  const vertical = def.o === 'v';
  const onLeft = vertical && def.x === 0;
  const onRight = vertical && def.x === 100;

  const left = onRight ? def.x - THICK : def.x;
  const box = {
    left: `${left}%` as const,
    top: `${def.y}%` as const,
    width: `${vertical ? THICK : def.len}%` as const,
    height: `${vertical ? def.len : THICK}%` as const,
  };

  return (
    <Pressable
      disabled={!editable}
      onPress={() => onToggle?.(def.num)}
      hitSlop={8}
      style={[styles.window, box]}
    >
      {active ? <Halo size={40} /> : null}
      <View
        style={[
          styles.windowBar,
          active ? styles.windowActive : styles.windowIdle,
        ]}
      />
      <View
        style={[
          styles.badge,
          onLeft && styles.badgeToRight,
          onRight && styles.badgeToLeft,
          !vertical && styles.badgeToBelow,
          active && styles.badgeActive,
        ]}
      >
        <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
          {def.num}
        </Text>
      </View>
      {def.labelKey ? (
        <Text
          style={[
            styles.windowLabel,
            onLeft && styles.labelToRight,
            !vertical && styles.labelToBelow,
          ]}
          numberOfLines={1}
        >
          {t(`cleaning.windows.labels.${def.labelKey}`)}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function HallPlan({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle?: (num: number) => void;
}) {
  const { t } = useTranslation();
  const set = new Set(selected);

  return (
    <View style={styles.frame}>
      <View style={styles.plan}>
        {WALLS.map((w, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.wall,
              {
                left: `${w.x}%`,
                top: `${w.y}%`,
                width: `${w.w}%`,
                height: `${w.h}%`,
              },
            ]}
          />
        ))}

        <View pointerEvents="none" style={styles.stage}>
          <Text style={styles.stageText}>{t('cleaning.windows.stage')}</Text>
        </View>

        {WINDOWS.map((def, i) => (
          <WindowBar
            key={i}
            def={def}
            active={set.has(def.num)}
            editable={!!onToggle}
            onToggle={onToggle}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { paddingHorizontal: 30, paddingVertical: 8 },
  plan: {
    width: '100%',
    aspectRatio: 0.764,
    borderWidth: 3,
    borderColor: '#0f172a',
    borderRadius: 4,
    backgroundColor: '#fbfcfe',
  },
  wall: { position: 'absolute', backgroundColor: '#0f172a', borderRadius: 1.5 },
  stage: {
    position: 'absolute',
    bottom: 0,
    left: '26%',
    right: '18%',
    height: '6.5%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  window: { position: 'absolute' },
  windowBar: { ...StyleSheet.absoluteFillObject, borderRadius: 3 },
  windowIdle: { backgroundColor: '#f97316', opacity: 0.85 },
  windowActive: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.6,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  halo: {
    position: 'absolute',
    backgroundColor: '#fbbf24',
    marginTop: '50%',
    marginLeft: '50%',
  },
  badge: {
    position: 'absolute',
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeToRight: { left: 20, top: '50%', marginTop: -9.5 },
  badgeToLeft: { right: 20, top: '50%', marginTop: -9.5 },
  badgeToBelow: { top: 20, left: '50%', marginLeft: -9.5 },
  badgeActive: { borderColor: '#d97706', backgroundColor: '#fffbeb' },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: '#64748b' },
  badgeTextActive: { color: '#b45309' },
  windowLabel: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '600',
    color: '#94a3b8',
    width: 78,
  },
  labelToRight: { left: 42, top: '50%', marginTop: -5 },
  labelToBelow: { top: 20, left: '50%', marginLeft: 12, width: 40 },
});
