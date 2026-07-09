import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  addWeeks,
  formatWeekRange,
  isSameWeek,
  startOfWeekMonday,
} from '../lib/dates';

interface Props {
  weekStart: Date;
  onChange: (newWeekStart: Date) => void;
  /** Optional element rendered at the far right (e.g. a coordinator icon). */
  right?: ReactNode;
  /** Tapping the week range opens the week-navigator drawer. */
  onOpenDrawer?: () => void;
}

export function WeekNavigator({
  weekStart,
  onChange,
  right,
  onOpenDrawer,
}: Props) {
  const { t, i18n } = useTranslation();
  const today = new Date();
  const onCurrentWeek = isSameWeek(weekStart, today);

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        onPress={() => onChange(addWeeks(weekStart, -1))}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={20} color="#0ea5e9" />
      </Pressable>

      <View style={styles.center}>
        <View style={styles.rangeRow}>
          <Text style={styles.range}>
            {formatWeekRange(weekStart, i18n.language)}
          </Text>
          {onOpenDrawer ? (
            <BreathingDrawerButton onPress={onOpenDrawer} />
          ) : null}
        </View>
        {!onCurrentWeek && (
          <Pressable
            onPress={() => onChange(startOfWeekMonday(today))}
            hitSlop={8}
          >
            <Text style={styles.todayLink}>{t('schedule.weekNav.jumpToToday')}</Text>
          </Pressable>
        )}
        {onCurrentWeek && <Text style={styles.thisWeek}>{t('schedule.weekNav.thisWeek')}</Text>}
      </View>

      <Pressable
        style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        onPress={() => onChange(addWeeks(weekStart, 1))}
        hitSlop={8}
      >
        <Ionicons name="chevron-forward" size={20} color="#0ea5e9" />
      </Pressable>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

function BreathingDrawerButton({ onPress }: { onPress: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.94],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.72],
  });
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Animated.View
        style={[styles.drawerBtn, { opacity, transform: [{ scale }] }]}
      >
        <Ionicons name="list-outline" size={17} color="#185FA5" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowPressed: { backgroundColor: '#e0f2fe' },
  right: { marginLeft: 4 },
  center: { flex: 1, alignItems: 'center' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  drawerBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E6F1FB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  range: { fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  thisWeek: { fontSize: 11, color: '#0ea5e9', marginTop: 2, fontWeight: '500', fontFamily: 'Manrope_500Medium',},
  todayLink: { fontSize: 11, color: '#64748b', marginTop: 2, textDecorationLine: 'underline' },
});
