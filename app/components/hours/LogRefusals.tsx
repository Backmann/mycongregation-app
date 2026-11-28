import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { refusalLabel, useLogRefusals } from '../../lib/useServiceLog';

/**
 * «Запись 30 ноября · 1 ч не сохранена: отчёт за этот месяц уже сдан» —
 * every entry the server would not keep, on Home and on «Мой учёт часов»
 * alike, until the person closes it (28 November 2026). Before, the first
 * screen listening took the refusal and Home never showed it: the entry
 * disappeared without a word.
 */
export function LogRefusals() {
  const { t, i18n } = useTranslation();
  const { refusals, dismiss } = useLogRefusals();
  if (refusals.length === 0) return null;
  return (
    <View style={styles.list} testID="hours-refusals">
      {refusals.map((r) => {
        const what = refusalLabel(r, i18n.language, t);
        return (
          <View key={r.id} style={styles.row}>
            <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" />
            <Text style={styles.text}>
              {what
                ? t('hoursLog.refusedEntry', { what, why: r.why })
                : t('hoursLog.refused', { why: r.why })}
            </Text>
            <Pressable
              onPress={() => dismiss(r.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={16} color="#991b1b" />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, marginTop: 8 },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 10,
  },
  text: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#991b1b', lineHeight: 18 },
});
