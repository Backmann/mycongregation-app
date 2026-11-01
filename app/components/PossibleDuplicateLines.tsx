import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { tasksApi, type PossibleDuplicateCard } from '../lib/api';
import { formatDay } from '../lib/date-range';
import { useMayOpen } from '../lib/useMayOpen';

/**
 * «Возможно, одна и та же карточка» (1 November 2026): the two cards side
 * by side, why they look alike, and the two answers — merge them (the
 * secretary's; the card with more history is offered as the one to keep),
 * or «это разные люди», which is remembered for good.
 */
export function PossibleDuplicateLines({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const mayOpen = useMayOpen();
  const canMerge = mayOpen('/publishers/merge');
  const q = useQuery({
    queryKey: ['tasks', 'possible-duplicate', taskId],
    queryFn: () => tasksApi.possibleDuplicate(taskId),
    staleTime: 60 * 1000,
  });
  const distinct = useMutation({
    mutationFn: () => tasksApi.possibleDuplicateDistinct(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
  if (!q.data) return null;
  const [x, y] = q.data.cards;
  const richer = (a: PossibleDuplicateCard, b: PossibleDuplicateCard) =>
    a.departed !== b.departed
      ? !a.departed
      : a.reports !== b.reports
        ? a.reports > b.reports
        : a.createdAt < b.createdAt;
  const [keep, other] = richer(x, y) ? [x, y] : [y, x];
  const lang = i18n.language;
  const line = (c: PossibleDuplicateCard) =>
    [
      c.group ?? t('merge.facts.noGroup'),
      t('merge.facts.reports', { count: c.reports }),
      c.hasAccount ? t('merge.facts.hasAccount') : null,
      c.departed ? t('merge.facts.departed') : null,
      t('merge.facts.created', { date: formatDay(c.createdAt, lang) }),
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <View style={styles.box}>
      {[x, y].map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push(`/publishers/${c.id}` as never)}
          style={styles.card}
          accessibilityRole="link"
        >
          <Text style={styles.name}>{c.displayName}</Text>
          <Text style={styles.muted}>{line(c)}</Text>
        </Pressable>
      ))}
      <Text style={styles.muted}>
        {t('merge.duplicate.why', {
          list: q.data.why.map((w) => t(`merge.duplicate.by.${w}`)).join(', '),
        })}
      </Text>
      <View style={styles.actions}>
        {canMerge ? (
          <Pressable
            style={styles.primary}
            onPress={() =>
              router.push(
                `/publishers/merge?kept=${keep.id}&merged=${other.id}` as never,
              )
            }
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{t('merge.task.merge')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.secondary}
          onPress={() => distinct.mutate()}
          disabled={distinct.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('merge.task.distinct')}</Text>
        </Pressable>
      </View>
      {!canMerge ? (
        <Text style={styles.muted}>{t('merge.task.secretaryMerges')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, marginTop: 4 },
  card: { padding: 10, borderRadius: 8, backgroundColor: '#f8fafc', gap: 2 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  muted: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0e5f73',
    justifyContent: 'center',
  },
  primaryText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
  },
  secondaryText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#0f172a' },
});
