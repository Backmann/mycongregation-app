import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Interactive Kingdom Hall floor plan for the weekly window-washing rota,
 * traced from the congregation's drawing. Pure RN views (no SVG dependency).
 *
 * How it reads (redrawn 22 September): windows are pale glass, and only this
 * week's windows are amber with a halo — before, every window was the same
 * loud orange and the chosen one differed by a shade. Rooms are named INSIDE
 * the room, in the stage's small capitals (Foyer once, not once per window);
 * the three toilets carry door signs — a white figure on a dark square —
 * because no word fits beside the number in a cabin a phone draws ~50 points
 * wide. The service rooms are tinted so they part from the hall at a glance.
 * Under the plan, «Windows: 5» repeats the choice in words.
 *
 * NO numberOfLines ON LABELS HERE. On the web it sets max-width 100% of the
 * parent, and a label hung on a window bar got the bar's ~9 points: «М…»,
 * «Ж…», «Т…», and «Фойе» pulled 19 points left of its number.
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
 * number chip (which sits just OUTSIDE the window) turns amber in sync. With
 * «reduce motion» on, the halo holds still halfway through its breath.
 * Numbers 8 and 9 are groups of physical windows that toggle together.
 */

type Orientation = 'v' | 'h';
type SignKey = 'wcMen' | 'wcWomen' | 'wcAccessible';

interface WindowDef {
  num: number;
  x: number;
  y: number;
  len: number;
  o: Orientation;
  /** A toilet cabin: its door sign sits beside the number. */
  sign?: SignKey;
}

const THICK = 3.6;
const MAIN_YS = [64, 76, 88];
const MAIN_LEN = 10; // bigger windows 1–6, still fitting above the bottom wall

const WINDOWS: WindowDef[] = [
  // левая внешняя стена — туалеты (одинаковые кабинки), окно 9
  { num: 9, x: 0, y: 4, len: 10, o: 'v', sign: 'wcMen' },
  { num: 9, x: 0, y: 20, len: 10, o: 'v', sign: 'wcWomen' },
  { num: 9, x: 0, y: 44, len: 10, o: 'v', sign: 'wcAccessible' },
  // главный зал: 1-2-3 слева (крупнее, симметрично с правыми)
  { num: 1, x: 0, y: MAIN_YS[0], len: MAIN_LEN, o: 'v' },
  { num: 2, x: 0, y: MAIN_YS[1], len: MAIN_LEN, o: 'v' },
  { num: 3, x: 0, y: MAIN_YS[2], len: MAIN_LEN, o: 'v' },
  // верхняя стена — окна 8 (одинаковые): фойе, фойе, кухня
  { num: 8, x: 28, y: 0, len: 15, o: 'h' },
  { num: 8, x: 46, y: 0, len: 15, o: 'h' },
  { num: 8, x: 70, y: 0, len: 15, o: 'h' },
  // правая стена: 7 в классе, затем 6-5-4 в зале (симметрично слева)
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
  // низ класса (граница с главным залом справа)
  { x: 62, y: 58, w: 38, h: WT },
];

/** Service rooms — the three toilets and the kitchen — tinted under the walls. */
const SERVICE_ROOMS: { x: number; y: number; w: number; h: number }[] = [
  { x: 0, y: 0, w: 26, h: 16 },
  { x: 0, y: 16, w: 26, h: 16 },
  { x: 0, y: 40, w: 26, h: 18 },
  { x: 62, y: 0, w: 38, h: 24 },
];

/**
 * Room names, each placed inside its room: `x`/`w` the room's span, `y` where
 * the name stands — clear of the number chips (the top 8s end near 11%, the
 * classroom's 7 starts near 37%). Measured: the longest, «KLASSENRAUM», is
 * ~75 points against a classroom ~80 points wide on a 360-point phone.
 */
const ROOM_NAMES: { key: 'foyer' | 'kitchen' | 'classroom'; x: number; w: number; y: number }[] = [
  { key: 'foyer', x: 26, w: 36, y: 17 },
  { key: 'kitchen', x: 62, w: 38, y: 14 },
  { key: 'classroom', x: 62, w: 38, y: 28 },
];

/** The toilets' door signs — the figure a hall door carries, in no language. */
const SIGN_ICON: Record<SignKey, keyof typeof MaterialCommunityIcons.glyphMap> = {
  wcMen: 'human-male',
  wcWomen: 'human-female',
  wcAccessible: 'wheelchair-accessibility',
};

/**
 * The device's «reduce motion» setting, followed as it changes.
 *
 * Read through AccessibilityInfo rather than once at start-up: on the web it
 * is the `prefers-reduced-motion` media query, and the screenshot script turns
 * it on for the plan's frame only, while the page is already running.
 */
function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setOn(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      alive = false;
      // react-native-web returns nothing when the browser has no matchMedia.
      sub?.remove();
    };
  }, []);
  return on;
}

function WindowHalo({ vertical }: { vertical: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  /**
   * The halo breathes on a 2.3-second loop. A person who asked their device
   * for less motion gets it standing still — and so does the screenshot
   * script: a frame taken at a fixed delay caught the loop at a different
   * point on every run, and 24-windows-plan differed between two runs of the
   * same code, only inside this halo (22 September).
   */
  const still = useReduceMotion();
  useEffect(() => {
    if (still) {
      pulse.setValue(0.5);
      return;
    }
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
  }, [pulse, still]);

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
  // «Окна: 9 · Муж. туалет» — what a screen reader says for the bar and the
  // number alike, with the choice as state rather than as words.
  const room = def.sign ? t(`cleaning.windows.labels.${def.sign}`) : null;
  const name = [t('cleaningHall.windows', { list: String(def.num) }), room].filter(Boolean).join(' · ');
  const toggle = () => onToggle?.(def.num);

  return (
    <View style={[styles.window, box]}>
      {active ? <WindowHalo vertical={vertical} /> : null}
      <Pressable
        disabled={!editable}
        onPress={toggle}
        hitSlop={12}
        style={StyleSheet.absoluteFill}
        accessibilityRole={editable ? 'button' : undefined}
        accessibilityLabel={name}
        accessibilityState={{ selected: active }}
      >
        <View style={[styles.windowBar, active ? styles.windowActive : styles.windowIdle]} />
      </Pressable>

      {/*
        The number beside the window (outside it), lit in sync. When editing it
        answers a tap too — it is where a finger goes; the bar alone is ~9
        points wide.
      */}
      <Pressable
        disabled={!editable}
        onPress={toggle}
        hitSlop={8}
        pointerEvents={editable ? 'auto' : 'none'}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.badge,
          onLeft && styles.badgeLeft,
          onRight && styles.badgeRight,
          !vertical && styles.badgeTop,
          active && styles.badgeActive,
        ]}
      >
        <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{def.num}</Text>
      </Pressable>

      {def.sign ? (
        <View style={styles.sign} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons name={SIGN_ICON[def.sign]} size={12} color="#ffffff" />
        </View>
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
  const chosen = [...set].sort((a, b) => a - b);

  return (
    <View style={styles.frame}>
      <View style={styles.plan}>
        {SERVICE_ROOMS.map((r, i) => (
          <View
            key={`room-${i}`}
            pointerEvents="none"
            style={[
              styles.serviceRoom,
              { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` },
            ]}
          />
        ))}

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

        {ROOM_NAMES.map((r) => (
          <View
            key={r.key}
            pointerEvents="none"
            style={[styles.roomName, { left: `${r.x}%`, width: `${r.w}%`, top: `${r.y}%` }]}
          >
            <Text style={styles.roomNameText}>{t(`cleaning.windows.labels.${r.key}`)}</Text>
          </View>
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

      {/* The choice in words, the same line the feed and the cleaning list show. */}
      <View style={styles.legend}>
        {chosen.length ? (
          <>
            <View style={styles.legendSwatch} />
            <Text style={styles.legendText}>
              {t('cleaningHall.windows', { list: chosen.join(', ') })}
            </Text>
          </>
        ) : (
          <Text style={styles.legendNone}>{t('cleaning.windows.none')}</Text>
        )}
      </View>
    </View>
  );
}

const WALL = '#1e293b';
const INK_SOFT = '#64748b';

const styles = StyleSheet.create({
  frame: { paddingHorizontal: 34, paddingVertical: 10 },
  plan: {
    width: '100%',
    aspectRatio: 0.764,
    borderWidth: 3,
    borderColor: WALL,
    borderRadius: 4,
    backgroundColor: '#fbfcfe',
  },
  serviceRoom: { position: 'absolute', backgroundColor: '#f1f5f9' },
  wall: { position: 'absolute', backgroundColor: WALL, borderRadius: 1.5 },
  roomName: { position: 'absolute', alignItems: 'center' },
  // The stage's own small capitals, so every room speaks alike. Contrast
  // 4.6:1 on the floor — the old 8-point #94a3b8 labels were 2.5:1.
  roomNameText: {
    fontSize: 8.5,
    fontFamily: 'Manrope_800ExtraBold',
    fontWeight: '800',
    letterSpacing: 1.2,
    color: INK_SOFT,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
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
    color: INK_SOFT,
    textTransform: 'uppercase',
  },
  window: { position: 'absolute' },
  halo: {
    ...StyleSheet.absoluteFillObject,
    margin: -10,
    backgroundColor: '#fbbf24',
  },
  windowBar: { flex: 1, borderRadius: 3 },
  // Glass: pale, so the week's windows are the only loud thing on the plan.
  windowIdle: { backgroundColor: '#bae6fd', borderWidth: 1, borderColor: '#7dd3fc' },
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
  badgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: INK_SOFT },
  badgeTextActive: { color: '#fff' },
  // Door sign right of the number: 5 + 20 chip + 2 gap. Worked out from the
  // plan's width on frame 24 (246 points on a 390-point phone): the sign ends
  // ~53 points from the outer wall against a cabin ~59 wide; on a 360-point
  // phone ~51 against ~52. Narrower than that, number and sign would touch
  // the cabin wall.
  sign: {
    position: 'absolute',
    left: '100%',
    marginLeft: 27,
    top: '50%',
    marginTop: -8,
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#f59e0b' },
  legendText: { fontSize: 13.5, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: '#b45309' },
  legendNone: { fontSize: 13.5, fontFamily: 'Manrope_500Medium', fontWeight: '500', color: '#94a3b8' },
});
