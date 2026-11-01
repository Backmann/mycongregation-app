import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tasksApi } from '../lib/api';

/**
 * «Администратор не старейшина»: whose account it is, and what to do
 * (1 November 2026). Elders only, like the whole task list.
 */
export function AdminNotElderLine({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['tasks', 'admin-not-elder', taskId],
    queryFn: () => tasksApi.adminNotElder(taskId),
    staleTime: 60 * 1000,
  });
  return (
    <View style={styles.box}>
      {q.data ? <Text style={styles.name}>{q.data.name}</Text> : null}
      <Text style={styles.muted}>{t('tasks.adminNotElder.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 4 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  muted: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569' },
});
