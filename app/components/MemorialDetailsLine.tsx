import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { specialEventsApi } from '../lib/api';

/**
 * «Указать время и место Вечери» (27 November 2026): what the Memorial still
 * lacks, read live, and the way to its page — where it is filled in. The task
 * closes itself once both are given.
 */
export function MemorialDetailsLine({ date }: { date: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['special-events', 'memorial-details', date],
    queryFn: async () =>
      (await specialEventsApi.list({ since: date })).find(
        (e) => e.type === 'memorial' && e.date === date,
      ) ?? null,
    staleTime: 60 * 1000,
  });
  const e = q.data;
  if (!e) return null;
  const noTime = !e.time;
  const noPlace = !!e.elsewhere && !e.address?.trim();
  return (
    <View style={styles.box}>
      {noTime || noPlace ? (
        <Text style={styles.muted}>
          {noTime && noPlace
            ? t('tasks.memorialDetails.missingBoth')
            : noTime
              ? t('tasks.memorialDetails.missingTime')
              : t('tasks.memorialDetails.missingPlace')}
        </Text>
      ) : null}
      <Pressable
        onPress={() => router.push(`/special-events/${e.id}` as never)}
        hitSlop={6}
        accessibilityRole="link"
      >
        <Text style={styles.link}>{t('tasks.memorialDetails.open')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 4 },
  muted: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569' },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#2563eb' },
});
