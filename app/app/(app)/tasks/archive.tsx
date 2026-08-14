import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { tasksApi, hallsApi, EldersMeeting } from '../../../lib/api';
import { LoadFailure } from '../../../components/LoadFailure';

/**
 * Every meeting that has been held, newest first, grouped by year.
 *
 * The agendas were reachable before — through the row of date chips at the top
 * of the agenda screen — but that row is for choosing what to work on next,
 * and it grew unusable the moment there were more than a handful. An archive
 * is a different act: looking BACK, often for a particular month, and often
 * with a visiting overseer waiting.
 *
 * Nothing is copied here and nothing is generated: the meetings are the same
 * rows, read once. Opening one hands it to the agenda screen, which already
 * knows how to show a meeting and how to print it.
 */
export default function AgendaArchiveScreen() {
  const { t, i18n } = useTranslation();
  const today = dayjs().format('YYYY-MM-DD');

  const meetingsQuery = useQuery({
    queryKey: ['tasks', 'meetings'],
    queryFn: () => tasksApi.meetings(),
  });
  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    staleTime: 60 * 60 * 1000,
  });

  /** Held meetings only, newest first, gathered under their year. */
  const years = useMemo(() => {
    const past = (meetingsQuery.data ?? [])
      .filter((m) => m.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));
    const out: { year: string; meetings: EldersMeeting[] }[] = [];
    for (const m of past) {
      const year = m.date.slice(0, 4);
      const last = out[out.length - 1];
      if (last?.year === year) last.meetings.push(m);
      else out.push({ year, meetings: [m] });
    }
    return out;
  }, [meetingsQuery.data, today]);

  const placeOf = (m: EldersMeeting): string | null => {
    const hall = (hallsQuery.data ?? []).find((h) => h.id === m.hallId);
    return hall?.name ?? m.placeText ?? null;
  };

  if (meetingsQuery.isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} />;
  }
  if (meetingsQuery.error) {
    return (
      <LoadFailure
        error={meetingsQuery.error}
        onRetry={() => meetingsQuery.refetch()}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {years.length === 0 ? (
        <Text style={styles.empty}>{t('agenda.archive.empty')}</Text>
      ) : (
        years.map((group) => (
          <View key={group.year}>
            <View style={styles.yearRow}>
              <Text style={styles.year}>{group.year}</Text>
              <Text style={styles.yearCount}>
                {t('agenda.archive.count', { count: group.meetings.length })}
              </Text>
            </View>

            <View style={styles.card}>
              {group.meetings.map((m, i) => {
                const d = dayjs(m.date).locale(i18n.language);
                const place = placeOf(m);
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.row, i > 0 && styles.rowDivided]}
                    onPress={() =>
                      router.push(
                        `/tasks/agenda?meetingId=${m.id}` as never,
                      )
                    }
                  >
                    {/* The date carries the weight — this is a list read by
                        date and nothing else. */}
                    <View style={styles.dateBox}>
                      <Text style={styles.day}>{d.format('D')}</Text>
                      <Text style={styles.month}>{d.format('MMM')}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.weekday}>{d.format('dddd')}</Text>
                      <Text style={styles.meta}>
                        {[m.startTime, place].filter(Boolean).join(' · ') ||
                          t('agenda.archive.noPlace')}
                      </Text>
                    </View>

                    {m.approvedAt ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#15803d"
                      />
                    ) : null}
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40 },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
  },
  year: { fontSize: 20, color: '#0f172a', fontFamily: 'Manrope_800ExtraBold' },
  yearCount: { fontSize: 12.5, color: '#94a3b8' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8edf3',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  dateBox: {
    width: 46,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 6,
  },
  day: { fontSize: 18, color: '#0e7490', fontFamily: 'Manrope_700Bold' },
  month: { fontSize: 11, color: '#64748b' },
  weekday: {
    fontSize: 14.5,
    color: '#0f172a',
    fontFamily: 'Manrope_600SemiBold',
    textTransform: 'capitalize',
  },
  meta: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
  empty: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 40 },
});
