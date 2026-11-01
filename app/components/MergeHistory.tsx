import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { cardMergeApi, extractErrorMessage } from '../lib/api';
import { formatDay } from '../lib/date-range';
import { confirm } from './ConfirmHost';
import { notify } from '../lib/error-bus';
import { useMayOpen } from '../lib/useMayOpen';

/**
 * At the foot of a card, for whoever may merge (1 November 2026): «Объединить
 * с другой карточкой…», and the merges into this card with «Разъединить»
 * while it is still possible — thirty days, the latest merge first.
 */
export function MergeHistory({ publisherId }: { publisherId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const mayOpen = useMayOpen();
  const q = useQuery({
    queryKey: ['card-merge', 'of', publisherId],
    queryFn: () => cardMergeApi.of(publisherId),
    staleTime: 30 * 1000,
  });
  const undo = useMutation({
    mutationFn: (mergeId: string) => cardMergeApi.undo(mergeId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['publishers'] });
      qc.invalidateQueries({ queryKey: ['publisher'] });
      qc.invalidateQueries({ queryKey: ['card-merge'] });
      // The sign-in moved with the card: the access block and the users
      // list read their own caches, and showed «no sign-in» until a reload.
      qc.invalidateQueries({ queryKey: ['publisher-access'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      const missed = Object.values(r.notReturned).reduce((a, b) => a + b, 0);
      notify(
        t('merge.history.undoneTitle'),
        missed > 0
          ? t('merge.history.undonePartly', { count: missed })
          : t('merge.history.undone'),
      );
    },
    onError: (e: unknown) =>
      notify(t('merge.history.undoneTitle'), extractErrorMessage(e)),
  });
  const lang = i18n.language;
  const rows = (q.data ?? []).filter((r) => !r.undoneAt);
  return (
    <View style={styles.wrap}>
      {mayOpen('/publishers/merge') ? (
        <Pressable
          onPress={() =>
            router.push(`/publishers/merge?kept=${publisherId}` as never)
          }
          hitSlop={6}
          testID="card-merge"
        >
          <Text style={styles.link}>{t('merge.fromCard')}</Text>
        </Pressable>
      ) : null}
      {rows.map((r) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.text}>
            {t('merge.history.line', {
              name: r.mergedName ?? '—',
              date: formatDay(r.createdAt, lang),
            })}
          </Text>
          {r.canUndo ? (
            <Pressable
              onPress={async () => {
                if (
                  await confirm({
                    title: t('merge.history.undoTitle'),
                    body: t('merge.history.undoBody', {
                      name: r.mergedName ?? '—',
                    }),
                    confirmLabel: t('merge.history.undo'),
                  })
                )
                  undo.mutate(r.id);
              }}
              disabled={undo.isPending}
              hitSlop={6}
            >
              <Text style={styles.undo}>
                {t('merge.history.undoUntil', {
                  date: formatDay(r.expiresAt, lang),
                })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { gap: 2 },
  link: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#0369a1' },
  text: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, lineHeight: 18, color: '#475569' },
  undo: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#9a3412' },
});
