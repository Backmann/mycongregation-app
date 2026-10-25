import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { conductRunsApi, meetingSettingsApi, specialEventsApi } from '../../../lib/api';
import type { ConductRun } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { usePermissions } from '../../../lib/permissions';
import { isConductOverseer } from '../../../lib/conduct-live';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { weekRules } from '../../../lib/week-rules';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { clock } from '../../../components/ConductSummary';
import { NoAccess } from '../../../components/NoAccess';
import { failsScreen } from '../../../lib/screen-failure';

/**
 * «ИТОГИ ВСТРЕЧ» — one place to find them (Lionel, 25 October 2026).
 *
 * A result is kept seven days and was found only at its meeting in the
 * Programme, which opens at the current week: a Wednesday's result was out
 * of sight by Monday though it was still kept. Here: every result still
 * kept, newest first — this week's and last week's, both meetings — for
 * whoever may read it. Opening one shows the same result as before.
 */

type Kind = 'midweek' | 'weekend';
const KINDS: Kind[] = ['weekend', 'midweek'];
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export default function ConductResults() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { responsibilities } = usePermissions();
  const mayRead = (kind: Kind) => isConductOverseer(user?.role, responsibilities, kind);
  const monday = startOfWeekMonday(new Date());
  const weeks = [formatDateISO(monday), formatDateISO(addDays(monday, -7))];
  const asks = weeks.flatMap((week) => KINDS.map((kind) => ({ week, kind })));
  const results = useQueries({
    queries: asks.map(({ week, kind }) => ({
      // The same key the meeting's link and the conduct screen use.
      queryKey: ['conduct-run', week, kind],
      queryFn: () => conductRunsApi.get(week, kind),
      // A failed answer is «не удалось загрузить», never an empty list.
      throwOnError: failsScreen,
      enabled: mayRead(kind),
      retry: false,
    })),
  });
  const { data: settings } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  const { data: events } = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    staleTime: 60 * 60 * 1000,
  });

  if (!mayRead('midweek') && !mayRead('weekend')) {
    return (
      <View style={styles.center}>
        <NoAccess hint={t('conduct.results.who')} />
      </View>
    );
  }
  const loading = results.some((q, i) => mayRead(asks[i].kind) && q.isLoading);
  const found = asks
    .map((a, i) => ({ ...a, run: results[i].data as ConductRun | null | undefined }))
    .filter((x): x is { week: string; kind: Kind; run: ConductRun } => !!x.run)
    .map((x) => {
      const day =
        weekRules({
          weekStartISO: x.week,
          version: effectiveVersionFor(settings?.versions, x.week),
          events: events ?? [],
        }).dateOf(x.kind) ?? x.week;
      return { ...x, day };
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  const dayLabel = (iso: string, weekday: boolean) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(i18n.language, {
      ...(weekday ? { weekday: 'short' as const } : {}),
      day: 'numeric',
      month: 'long',
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>{t('conduct.results.lead')}</Text>
      {loading && found.length === 0 ? <ActivityIndicator color="#0ea5e9" style={{ marginTop: 24 }} /> : null}
      {!loading && found.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="stats-chart-outline" size={26} color="#94a3b8" />
          <Text style={styles.emptyText}>{t('conduct.results.none')}</Text>
        </View>
      ) : null}
      {found.map(({ week, kind, run, day }) => {
        const drift = run.totalSec - run.plannedSec;
        const mins = Math.round(Math.abs(drift) / 60);
        const keep = new Date(new Date(run.savedAt).getTime() + KEEP_MS);
        return (
          <Pressable
            key={`${week}-${kind}`}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            onPress={() =>
              router.push(
                (kind === 'weekend' ? `/schedule/conduct?week=${week}&kind=weekend` : `/schedule/conduct?week=${week}`) as never,
              )
            }
            accessibilityRole="button"
          >
            <View style={[styles.kindDot, { backgroundColor: kind === 'weekend' ? '#7c3aed' : '#1d4ed8' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {t(kind === 'weekend' ? 'conduct.results.weekend' : 'conduct.results.midweek')}
                {' · '}
                {dayLabel(day, true)}
              </Text>
              <Text style={styles.figures}>
                {t('conduct.result.short', { took: clock(run.totalSec), planned: clock(run.plannedSec) })}
                {' · '}
                <Text style={mins === 0 ? styles.ok : drift > 0 ? styles.behind : styles.ahead}>
                  {mins === 0
                    ? t('conduct.onTime')
                    : drift > 0
                      ? t('conduct.behind', { minutes: mins })
                      : t('conduct.ahead', { minutes: mins })}
                </Text>
              </Text>
              <Text style={styles.keep}>{t('conduct.results.keep', { day: dayLabel(formatDateISO(keep), false) })}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 48, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  lead: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, lineHeight: 19, color: '#64748b', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  kindDot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#0f172a' },
  figures: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#334155', marginTop: 3 },
  ok: { color: '#15803d' },
  ahead: { color: '#15803d' },
  behind: { color: '#b45309' },
  keep: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#94a3b8', marginTop: 3 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#64748b', textAlign: 'center' },
});
