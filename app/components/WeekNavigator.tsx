import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addWeeks,
  formatWeekRange,
  isSameWeek,
  startOfWeekMonday,
} from '../lib/dates';

interface Props {
  weekStart: Date;
  onChange: (newWeekStart: Date) => void;
}

export function WeekNavigator({ weekStart, onChange }: Props) {
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
        <Text style={styles.range}>{formatWeekRange(weekStart)}</Text>
        {!onCurrentWeek && (
          <Pressable
            onPress={() => onChange(startOfWeekMonday(today))}
            hitSlop={8}
          >
            <Text style={styles.todayLink}>Jump to today</Text>
          </Pressable>
        )}
        {onCurrentWeek && <Text style={styles.thisWeek}>This week</Text>}
      </View>

      <Pressable
        style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        onPress={() => onChange(addWeeks(weekStart, 1))}
        hitSlop={8}
      >
        <Ionicons name="chevron-forward" size={20} color="#0ea5e9" />
      </Pressable>
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
  center: { flex: 1, alignItems: 'center' },
  range: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  thisWeek: { fontSize: 11, color: '#0ea5e9', marginTop: 2, fontWeight: '500' },
  todayLink: { fontSize: 11, color: '#64748b', marginTop: 2, textDecorationLine: 'underline' },
});
