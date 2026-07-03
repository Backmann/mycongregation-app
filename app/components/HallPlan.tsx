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
 * Interactive Kingdom Hall floor plan for the weekly window-washing rota.
 * Pure RN views (no SVG dependency): walls are thin views, windows are
 * rounded bars on the walls. Selected window numbers glow with a soft
 * MyBulb-style amber pulse. Numbers 8 and 9 are groups of physical windows
 * (8 = foyer ×2 + kitchen, 9 = the three washroom windows) that toggle
 * together. Positions are percentages of the plan box, traced from the
 * hall's floor-plan drawing.
 */

type Orientation = 'v' | 'h';

interface WindowDef {
  num: number;
  x: number; // %
  y: number; // %
  len: number; // % along the wall
  o: Orientation;
  labelKey?: string;
}

const THICK = 3.4; // window bar thickness, %

const WINDOWS: WindowDef[] = [
  // левая стена, сверху вниз — группа 9 (туалеты), затем 1–3
  { num: 9, x: 1.6, y: 6, len: 8.5, o: 'v', labelKey: 'wc1' },
  { num: 9, x: 1.6, y: 18.5, len: 8.5, o: 'v', labelKey: 'wc2' },
  { num: 9, x: 1.6, y: 43.5, len: 8.5, o: 'v', labelKey: 'wc3' },
  { num: 1, x: 1.6, y: 67.5, len: 9, o: 'v' },
  { num: 2, x: 1.6, y: 80, len: 9, o: 'v' },
  { num: 3, x: 1.6, y: 91.5, len: 7, o: 'v' },
  // верхняя стена — группа 8 (фойе ×2 + кухня)
  { num: 8, x: 30, y: 1.6, len: 13, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 47, y: 1.6, len: 13, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 66, y: 1.6, len: 13, o: 'h', labelKey: 'kitchen' },
  // правая стена, сверху вниз — 7, затем 6–4
  { num: 7, x: 95, y: 34, len: 16, o: 'v' },
  { num: 6, x: 95, y: 67.5, len: 9, o: 'v' },
  { num: 5, x: 95, y: 80, len: 9, o: 'v' },
  { num: 4, x: 95, y: 91.5, len: 7, o: 'v' },
];

/** Simplified interior walls, traced from the drawing (percent boxes). */
const WALLS: { x: number; y: number; w: number; h: number }[] = [
  // санитарный блок слева сверху
  { x: 0, y: 16, w: 20, h: 1.1 },
  { x: 19, y: 5, w: 1.6, h: 12 },
  { x: 0, y: 29.5, w: 30, h: 1.1 },
  { x: 29, y: 22, w: 1.6, h: 8.5 },
  // малая комната слева в середине
  { x: 0, y: 41, w: 12, h: 1.1 },
  { x: 20, y: 41, w: 14, h: 1.1 },
  { x: 33, y: 41, w: 1.6, h: 9 },
  { x: 0, y: 53.5, w: 34.6, h: 1.1 },
  // второй зал / кухня справа сверху
  { x: 63, y: 22.5, w: 1.6, h: 31 },
  { x: 63, y: 22.5, w: 34, h: 1.1 },
  { x: 63, y: 52.5, w: 20, h: 1.1 },
  { x: 88, y: 52.5, w: 12, h: 1.1 },
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
  const box = {
    left: `${def.x}%` as const,
    top: `${def.y}%` as const,
    width: `${vertical ? THICK : def.len}%` as const,
    height: `${vertical ? def.len : THICK}%` as const,
  };

  return (
    <Pressable
      disabled={!editable}
      onPress={() => onToggle?.(def.num)}
      hitSlop={10}
      style={[styles.window, box]}
    >
      {active ? <Halo size={44} /> : null}
      <View
        style={[
          styles.windowBar,
          active ? styles.windowActive : styles.windowIdle,
        ]}
      />
      <View
        style={[
          styles.badge,
          vertical ? styles.badgeRight : styles.badgeBelow,
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
            vertical ? styles.labelRight : styles.labelBelow,
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
  );
}

const styles = StyleSheet.create({
  plan: {
    width: '100%',
    aspectRatio: 0.82,
    backgroundColor: '#fbfcfe',
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#0f172a',
    overflow: 'hidden',
  },
  wall: { position: 'absolute', backgroundColor: '#0f172a', borderRadius: 2 },
  stage: {
    position: 'absolute',
    bottom: 0,
    left: '22%',
    right: '22%',
    height: '7%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  window: { position: 'absolute' },
  windowBar: { ...StyleSheet.absoluteFillObject, borderRadius: 4 },
  windowIdle: { backgroundColor: '#cbd5e1' },
  windowActive: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.55,
    shadowRadius: 6,
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRight: { left: '160%', top: '50%', marginTop: -10 },
  badgeBelow: { top: '150%', left: '50%', marginLeft: -10 },
  badgeActive: { borderColor: '#d97706', backgroundColor: '#fffbeb' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  badgeTextActive: { color: '#b45309' },
  windowLabel: {
    position: 'absolute',
    fontSize: 8.5,
    fontWeight: '600',
    color: '#94a3b8',
    width: 64,
  },
  labelRight: { left: '160%', top: '50%', marginTop: 12 },
  labelBelow: { top: '150%', left: '50%', marginLeft: 14 },
});
