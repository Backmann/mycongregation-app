import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { formatDay } from '../lib/date-range';
import { tasksApi, type InactiveHold } from '../lib/api';

/**
 * «Замена назначений»: whose the task is and what is still his
 * (1 November 2026). Read when the card is shown, so a part replaced a
 * minute ago is already gone from the list; the task itself closes by itself
 * on the next pass. Elders only — the whole task list is.
 */
export function InactiveHoldsLines({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['tasks', 'inactive-holds', taskId],
    queryFn: () => tasksApi.inactiveHolds(taskId),
    staleTime: 60 * 1000,
  });
  if (q.isLoading) {
    return <Text style={styles.muted}>{t('tasks.inactiveHolds.loading')}</Text>;
  }
  if (!q.data) return null;
  const lang = i18n.language;
  const when = (h: InactiveHold): string => {
    if (!h.date) return '';
    const day = formatDay(h.date, lang);
    return h.week ? t('tasks.inactiveHolds.week', { date: day }) : day;
  };
  const what = (h: InactiveHold): string => {
    switch (h.kind) {
      case 'part':
        return h.label || t('tasks.inactiveHolds.part');
      case 'duty':
        return h.label || t(`duties.types.${h.code}`, { defaultValue: h.code ?? '' });
      case 'cart':
        return [t('tasks.inactiveHolds.cart'), h.label].filter(Boolean).join(' · ');
      case 'field_service':
        return t('tasks.inactiveHolds.field_service');
      case 'talk':
        return t('tasks.inactiveHolds.talk');
      case 'group':
        return t(
          h.code === 'overseer'
            ? 'tasks.inactiveHolds.groupOverseer'
            : 'tasks.inactiveHolds.groupAssistant',
          { name: h.label ?? '' },
        );
      case 'responsibility':
        return t(`responsibilities.types.${h.code}`, { defaultValue: h.code ?? '' });
    }
  };
  return (
    <View style={styles.box}>
      <Text style={styles.name}>{q.data.name}</Text>
      {q.data.holds.length === 0 ? (
        <Text style={styles.muted}>{t('tasks.inactiveHolds.none')}</Text>
      ) : (
        <View style={styles.list}>
          {q.data.holds.map((h, i) => (
            <View key={i} style={styles.line}>
              <Text style={styles.what}>{what(h)}</Text>
              <Text style={styles.when}>{when(h)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.muted}>{t('tasks.inactiveHolds.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, marginTop: 4 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  list: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  what: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#0f172a' },
  when: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569' },
  muted: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569' },
});
