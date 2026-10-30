import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { pioneerMeetingsApi, type PioneerMeetingView } from '../../../lib/api';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';
import { formatDateISO } from '../../../lib/dates';
import { formatDay } from '../../../lib/date-range';
import { PioneerMeetingForm } from '../../../components/PioneerMeetingForm';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#0e7490';

/**
 * «Ежегодная встреча старейшин с пионерами» (S-211; 30 October 2026) — the
 * coming meeting, the years before it with who conducted each, and for whoever
 * arranges it the button to set one. Elders only.
 */
export default function PioneerMeetingsScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useLocalSearchParams<{ new?: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['pioneer-meetings'],
    queryFn: () => pioneerMeetingsApi.list(),
    throwOnError: failsScreen,
  });
  const [formOpen, setFormOpen] = useState(false);
  // From the body's task: «Назначить встречу» opens the form at once.
  useEffect(() => {
    if (params.new === '1' && q.data?.canManage) setFormOpen(true);
  }, [params.new, q.data?.canManage]);

  const today = formatDateISO(new Date());
  const all = q.data?.meetings ?? [];
  const coming = all.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = all.filter((m) => m.date < today);

  const when = (m: PioneerMeetingView) =>
    [
      formatDay(m.date, lang, { year: 'always', weekday: 'short' }),
      m.timeStart ? (m.timeEnd ? `${m.timeStart}–${m.timeEnd}` : m.timeStart) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const open = (m: PioneerMeetingView) =>
    router.push({ pathname: '/service-reports/pioneer-meeting', params: { id: m.id } } as never);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Text style={styles.kicker}>S-211</Text>
        <Text style={styles.title}>{t('pioneerMeeting.title')}</Text>
        <Text style={styles.lead}>{t('pioneerMeeting.about')}</Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : q.isError ? (
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {coming.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={20} color={MUTED} />
              <Text style={styles.emptyText}>{t('pioneerMeeting.noneComing')}</Text>
            </View>
          ) : (
            coming.map((m) => (
              <Pressable key={m.id} onPress={() => open(m)} style={styles.card} accessibilityRole="button">
                <Text style={styles.when}>{when(m)}</Text>
                {m.place ? <Text style={styles.sub}>{m.place}</Text> : null}
                <Text style={styles.sub}>{t('pioneerMeeting.conductedBy', { name: m.conductor.name })}</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{t('pioneerMeeting.invitedCount', { count: m.invitedCount })}</Text>
                </View>
              </Pressable>
            ))
          )}
          {q.data?.canManage ? (
            <Pressable onPress={() => setFormOpen(true)} style={styles.add} accessibilityRole="button" testID="pioneer-meeting-new">
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addText}>{t('pioneerMeeting.setNew')}</Text>
            </Pressable>
          ) : null}

          {past.length > 0 ? (
            <View style={{ marginTop: 18, gap: 8 }}>
              <Text style={styles.section}>{t('pioneerMeeting.past')}</Text>
              {past.map((m) => (
                <Pressable key={m.id} onPress={() => open(m)} style={styles.row} accessibilityRole="button">
                  <Text style={styles.rowDate}>{formatDay(m.date, lang, { year: 'always' })}</Text>
                  <Text style={styles.rowWho} numberOfLines={1}>
                    {m.conductor.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )}
      <PioneerMeetingForm
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ['pioneer-meetings'] })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  head: { gap: 4, marginBottom: 4 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.8, color: '#94a3b8' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: INK, letterSpacing: -0.3 },
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, lineHeight: 20, color: '#475569' },
  empty: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    padding: 16,
  },
  emptyText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: MUTED },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#a5f3fc', padding: 16, gap: 4 },
  when: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK },
  sub: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#475569' },
  pill: { alignSelf: 'flex-start', backgroundColor: '#ecfeff', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginTop: 6 },
  pillText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12, color: BRAND },
  add: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 13,
  },
  addText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  section: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDate: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  rowWho: { flex: 1, textAlign: 'right', fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: MUTED },
});
