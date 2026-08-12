import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { ElderTask, meApi } from '../../../lib/api';
import { LoadFailure } from '../../../components/LoadFailure';

/**
 * What has been put on me — and nothing else.
 *
 * The elders' section stays the elders': a brother has no business reading
 * what the body is working through, and that was decided on purpose. But a
 * task given to him and invisible to him is not a task, it is a telephone call
 * somebody still has to make. So this screen is narrow by design: his own
 * items, read-only, with the date and whatever detail was written for him.
 *
 * READ-ONLY IS ALSO DELIBERATE. Closing a task is the body's act, recorded
 * with who closed it; a brother marking his own done would put the list out of
 * step with what was actually agreed.
 */
export default function MyTasksScreen() {
  const { t, i18n } = useTranslation();

  const query = useQuery({
    queryKey: ['me', 'tasks'],
    queryFn: () => meApi.tasks(),
  });

  const today = dayjs().format('YYYY-MM-DD');
  const fmt = (iso: string) => dayjs(iso).locale(i18n.language).format('D MMMM');

  const titleOf = (task: ElderTask): string =>
    task.kind ? t(`tasks.calendar.${task.kind}`) : task.title;

  const when = (task: ElderTask): string => {
    if (!task.dueDate) return '';
    const days = dayjs(task.dueDate).diff(dayjs(today), 'day');
    if (days < 0) return t('tasks.lateByDays', { count: -days });
    if (days === 0) return t('tasks.dueToday');
    if (days === 1) return t('tasks.dueTomorrow');
    if (days <= 7) return t('tasks.dueInDays', { count: days });
    return fmt(task.dueDate) + (task.dueTime ? ` · ${task.dueTime}` : '');
  };

  if (query.isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }
  if (query.error) {
    return <LoadFailure error={query.error} onRetry={() => query.refetch()} />;
  }

  const tasks = query.data ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>{t('tasks.noneMine')}</Text>
      ) : (
        tasks.map((task) => {
          const late = !!task.dueDate && task.dueDate < today;
          return (
            <View key={task.id} style={[styles.card, late && styles.cardLate]}>
              <Text style={styles.title}>{titleOf(task)}</Text>
              {when(task) ? (
                <View style={styles.whenRow}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={late ? '#A32D2D' : '#64748b'}
                  />
                  <Text style={[styles.when, late && styles.whenLate]}>
                    {when(task)}
                  </Text>
                </View>
              ) : null}
              {task.details ? (
                <Text style={styles.details}>{task.details}</Text>
              ) : null}
            </View>
          );
        })
      )}
      {/* Said once, plainly, so nobody hunts for a button that is not there. */}
      {tasks.length > 0 ? (
        <Text style={styles.note}>{t('tasks.mine.readOnly')}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8edf3',
  },
  cardLate: { borderColor: '#F09595' },
  title: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 21,
  },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  when: { fontSize: 13, color: '#64748b' },
  whenLate: { color: '#A32D2D' },
  details: { fontSize: 13.5, color: '#475569', lineHeight: 19, marginTop: 8 },
  empty: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 32 },
  note: { fontSize: 12.5, color: '#94a3b8', marginTop: 6, lineHeight: 18 },
});
