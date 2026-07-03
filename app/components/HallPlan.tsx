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
 * traced from the congregation's drawing. Pure RN views (no SVG dependency).
 *
 * Layout (percent of the plan box, which is taller than wide):
 *  - Bottom half is the MAIN HALL: windows 1/2/3 (left) and 6/5/4 (right)
 *    are identical length and pairwise level, symmetric across the room.
 *  - Top-left: men's WC and women's WC (identical cabins), then the
 *    accessible WC below them. Window 9 on each left exterior wall.
 *  - Top-right: kitchen on top (smaller), the additional classroom below it
 *    (larger). Window 7 faces out on the classroom's right wall; window 8
 *    "kitchen" is on the top wall above the kitchen.
 *  - Top wall: 8 foyer, 8 foyer, 8 kitchen — identical length.
 *  - Stage at the bottom wall, centre.
 *
 * Selecting a window lights the WHOLE window plus its number as one amber
 * unit, wrapped in a soft, breathing MyBulb-style halo. Numbers 8 and 9 are
 * groups of physical windows that toggle together.
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

const THICK = 3.4;

const MAIN_YS = [68, 80, 92];

const WINDOWS: WindowDef[] = [
  // левая внешняя стена — туалеты (одинаковые), окно 9
  { num: 9, x: 0, y: 4, len: 10, o: 'v', labelKey: 'wcMen' },
  { num: 9, x: 0, y: 20, len: 10, o: 'v', labelKey: 'wcWomen' },
  { num: 9, x: 0, y: 44, len: 10, o: 'v', labelKey: 'wcAccessible' },
  // главный зал: 1-2-3 слева (одинаковые, симметрично с правыми)
  { num: 1, x: 0, y: MAIN_YS[0], len: 8, o: 'v' },
  { num: 2, x: 0, y: MAIN_YS[1], len: 8, o: 'v' },
  { num: 3, x: 0, y: MAIN_YS[2], len: 8, o: 'v' },
  // верхняя стена — окна 8 (одинаковые): фойе, фойе, кухня
  { num: 8, x: 28, y: 0, len: 15, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 46, y: 0, len: 15, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 70, y: 0, len: 15, o: 'h', labelKey: 'kitchen' },
  // правая стена: 7 в доп. классе, затем 6-5-4 в зале (симметрично слева)
  { num: 7, x: 100, y: 34, len: 14, o: 'v' },
  { num: 6, x: 100, y: MAIN_YS[0], len: 8, o: 'v' },
  { num: 5, x: 100, y: MAIN_YS[1], len: 8, o: 'v' },
  { num: 4, x: 100, y: MAIN_YS[2], len: 8, o: 'v' },
];

const WT = 1.4;
const WALLS: { x: number; y: number; w: number; h: number }[] = [
  // стена верх/низ: главный зал отделён, с проёмом-входом по центру
  { x: 0, y: 60, w: 30, h: WT },
  { x: 44, y: 60, w: 18, h: WT },
  // мужской туалет (кабинка), одинаков с женским
  { x: 0, y: 16, w: 26, h: WT },
  { x: 26 - WT, y: 4, w: WT, h: 12 },
  // женский туалет
  { x: 0, y: 32, w: 26, h: WT },
  { x: 26 - WT, y: 18, w: WT, h: 14 },
  // туалет для инвалидов
  { x: 0, y: 40, w: 20, h: WT },
  { x: 20 - WT, y: 40, w: WT, h: 18 },
  { x: 0, y: 58, w: 26, h: WT },
  // правая часть: вертикальная стена класса+кухни
  { x: 62, y: 0, w: WT, h: 58 },
  // стена между кухней (сверху) и классом (снизу), с проёмом у внешней стены
  { x: 62, y: 24, w: 26, h: WT },
  // низ класса
  { x: 62, y: 58, w: 38, h: WT },
];

function WindowHalo({ radius }: { radius: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1150,
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
          borderRadius: radius,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.18, 0.45],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1.12],
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
      hitSlop={10}
      style={[styles.window, box]}
    >
      {active ? <WindowHalo radius={vertical ? 40 : 24} /> : null}
      <View
        style={[
          styles.windowBar,
          active ? styles.windowActive : styles.windowIdle,
        ]}
      />
      {/* Цифра прямо на окне: часть светящегося блока */}
      <View
        style={[
          styles.badge,
          onLeft && styles.badgeLeft,
          onRight && styles.badgeRight,
          !vertical && styles.badgeTop,
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
            onLeft && styles.labelLeft,
            !vertical && styles.labelTop,
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
  frame: { paddingHorizontal: 32, paddingVertical: 8 },
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
    left: '24%',
    right: '24%',
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
  window: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -9,
    backgroundColor: '#fbbf24',
  },
  windowBar: { ...StyleSheet.absoluteFillObject, borderRadius: 3 },
  windowIdle: { backgroundColor: '#f97316', opacity: 0.9 },
  windowActive: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  // Число сидит по центру окна — часть светящегося блока.
  badge: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLeft: {},
  badgeRight: {},
  badgeTop: {},
  badgeActive: { backgroundColor: '#fff' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#b45309' },
  badgeTextActive: { color: '#b45309' },
  windowLabel: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '600',
    color: '#94a3b8',
    width: 76,
  },
  labelLeft: { left: 22, width: 76 },
  labelTop: { top: 20, width: 44, textAlign: 'center' },
});
