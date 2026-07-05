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
 *  - Bottom half is the MAIN HALL — a clean open room with the stage at the
 *    bottom wall. Windows 1/2/3 (left) and 6/5/4 (right) are identical length
 *    and pairwise level, symmetric across the room. No interior walls here.
 *  - Top-left: men's WC and women's WC (identical cabins), then the
 *    accessible WC below. Window 9 on each left exterior wall.
 *  - Top-right: kitchen on top (smaller) with window 8 on the top wall; the
 *    additional classroom below it (larger) with window 7 on the right wall.
 *  - Top wall: 8 foyer, 8 foyer, 8 kitchen — identical length.
 *
 * Selecting a window lights the whole bar plus a breathing amber halo, and its
 * number chip (which sits just OUTSIDE the window) turns amber in sync.
 * Numbers 8 and 9 are groups of physical windows that toggle together.
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

const THICK = 3.6;
const MAIN_YS = [64, 76, 88];
const MAIN_LEN = 10; // bigger windows 1–6, still fitting above the bottom wall

const WINDOWS: WindowDef[] = [
  // левая внешняя стена — туалеты (одинаковые кабинки), окно 9
  { num: 9, x: 0, y: 4, len: 10, o: 'v', labelKey: 'wcMen' },
  { num: 9, x: 0, y: 20, len: 10, o: 'v', labelKey: 'wcWomen' },
  { num: 9, x: 0, y: 44, len: 10, o: 'v', labelKey: 'wcAccessible' },
  // главный зал: 1-2-3 слева (крупнее, симметрично с правыми)
  { num: 1, x: 0, y: MAIN_YS[0], len: MAIN_LEN, o: 'v' },
  { num: 2, x: 0, y: MAIN_YS[1], len: MAIN_LEN, o: 'v' },
  { num: 3, x: 0, y: MAIN_YS[2], len: MAIN_LEN, o: 'v' },
  // верхняя стена — окна 8 (одинаковые): фойе, фойе, кухня
  { num: 8, x: 28, y: 0, len: 15, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 46, y: 0, len: 15, o: 'h', labelKey: 'foyer' },
  { num: 8, x: 70, y: 0, len: 15, o: 'h', labelKey: 'kitchen' },
  // правая стена: 7 в доп. классе, затем 6-5-4 в зале (симметрично слева)
  { num: 7, x: 100, y: 34, len: 14, o: 'v' },
  { num: 6, x: 100, y: MAIN_YS[0], len: MAIN_LEN, o: 'v' },
  { num: 5, x: 100, y: MAIN_YS[1], len: MAIN_LEN, o: 'v' },
  { num: 4, x: 100, y: MAIN_YS[2], len: MAIN_LEN, o: 'v' },
];

const WT = 1.4;
// Interior walls — only in the UPPER half. The main hall stays open (no stubs).
const WALLS: { x: number; y: number; w: number; h: number }[] = [
  // мужской туалет (кабинка), одинаков с женским
  { x: 0, y: 16, w: 26, h: WT },
  { x: 26 - WT, y: 0, w: WT, h: 16 },
  // женский туалет
  { x: 0, y: 32, w: 26, h: WT },
  { x: 26 - WT, y: 16, w: WT, h: 16 },
  // туалет для инвалидов (замкнутая комната)
  { x: 0, y: 40, w: 26, h: WT },
  { x: 26 - WT, y: 40, w: WT, h: 18 },
  { x: 0, y: 58, w: 26, h: WT },
  // правая часть: вертикальная стена, отделяющая кухню+класс от зала/фойе
  { x: 62, y: 0, w: WT, h: 58 },
  // стена между кухней (сверху) и классом (снизу)
  { x: 62, y: 24, w: 38, h: WT },
  // низ доп. класса (граница с главным залом справа)
  { x: 62, y: 58, w: 38, h: WT },
];

function WindowHalo({ vertical }: { vertical: boolean }) {
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
          borderRadius: vertical ? 12 : 10,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.2, 0.5],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.88, 1.15],
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
    <View style={[styles.window, box]}>
      {active ? <WindowHalo vertical={vertical} /> : null}
      <Pressable
        disabled={!editable}
        onPress={() => onToggle?.(def.num)}
        hitSlop={12}
        style={StyleSheet.absoluteFill}
      >
        <View
          style={[
            styles.windowBar,
            active ? styles.windowActive : styles.windowIdle,
          ]}
        />
      </Pressable>

      {/* Цифра рядом с окном (снаружи), подсвечивается синхронно */}
      <View
        style={[
          styles.badge,
          onLeft && styles.badgeLeft,
          onRight && styles.badgeRight,
          !vertical && styles.badgeTop,
          active && styles.badgeActive,
        ]}
        pointerEvents="none"
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
          pointerEvents="none"
        >
          {t(`cleaning.windows.labels.${def.labelKey}`)}
        </Text>
      ) : null}
    </View>
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
  frame: { paddingHorizontal: 34, paddingVertical: 10 },
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
    fontWeight: '800', fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: 1.2,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  window: { position: 'absolute' },
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -10,
    backgroundColor: '#fbbf24',
  },
  windowBar: { flex: 1, borderRadius: 3 },
  windowIdle: { backgroundColor: '#f97316', opacity: 0.9 },
  windowActive: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.75,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  // Кружок с номером — снаружи окна.
  badge: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLeft: { left: '100%', marginLeft: 5, top: '50%', marginTop: -10 },
  badgeRight: { right: '100%', marginRight: 5, top: '50%', marginTop: -10 },
  badgeTop: { top: '100%', marginTop: 5, left: '50%', marginLeft: -10 },
  badgeActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#d97706',
  },
  badgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#64748b' },
  badgeTextActive: { color: '#fff' },
  windowLabel: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#94a3b8',
    width: 74,
  },
  labelLeft: { left: '100%', marginLeft: 28, top: '50%', marginTop: -5 },
  labelTop: {
    top: '100%',
    marginTop: 26,
    left: '50%',
    marginLeft: -37,
    width: 74,
    textAlign: 'center',
  },
});
