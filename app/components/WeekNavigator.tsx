import { Pressable, StyleSheet, Text, View } from 'react-native';
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
}

export function WeekNavigator({ weekStart, onChange, right }: Props) {
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
        <Text style={styles.range}>{formatWeekRange(weekStart, i18n.language)}</Text>
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
  range: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  thisWeek: { fontSize: 11, color: '#0ea5e9', marginTop: 2, fontWeight: '500' },
  todayLink: { fontSize: 11, color: '#64748b', marginTop: 2, textDecorationLine: 'underline' },
});
