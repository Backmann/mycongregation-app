import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, pioneerMeetingsApi, type PioneerMeetingWarning } from '../../../lib/api';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';
import { formatDay } from '../../../lib/date-range';
import { confirm } from '../../../components/ConfirmHost';
import { PioneerMeetingForm } from '../../../components/PioneerMeetingForm';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#0e7490';

/**
 * One annual meeting with the pioneers (S-211): when and where, who conducts
 * it, who is invited and who of them is away, and what is worth knowing
 * before the day. For the elders and for the elder who conducts it.
 */
export default function PioneerMeetingScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['pioneer-meeting', id],
    queryFn: () => pioneerMeetingsApi.get(id!),
    enabled: !!id,
    throwOnError: failsScreen,
  });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = q.data;

  const warningText = (w: PioneerMeetingWarning) =>
    w.kind === 'outsideSeason'
      ? t('pioneerMeeting.warn.outsideSeason')
      : w.kind === 'conductorAway'
        ? t('pioneerMeeting.warn.conductorAway')
        : t('pioneerMeeting.warn.event', { title: w.title });

  const cancel = async () => {
    if (!m) return;
    const ok = await confirm({
      title: t('pioneerMeeting.cancelTitle'),
      body: t('pioneerMeeting.cancelBody'),
      confirmLabel: t('pioneerMeeting.cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await pioneerMeetingsApi.remove(m.id);
      await qc.invalidateQueries({ queryKey: ['pioneer-meetings'] });
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  if (q.isLoading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (q.isError || !m) {
    return (
      <View style={{ padding: 16 }}>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      </View>
    );
  }
  const away = m.invited.filter((p) => p.away).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{t('pioneerMeeting.title')}</Text>
        <Text style={styles.when}>{formatDay(m.date, lang, { year: 'always', weekday: 'long' })}</Text>
        <Text style={styles.sub}>
          {[m.timeStart ? (m.timeEnd ? `${m.timeStart}–${m.timeEnd}` : m.timeStart) : null, m.place]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={styles.byRow}>
          <Ionicons name="person-circle-outline" size={18} color={BRAND} />
          <Text style={styles.by}>{t('pioneerMeeting.conductedBy', { name: m.conductor.name })}</Text>
        </View>
        <Text style={styles.outline}>{t('pioneerMeeting.outline')}</Text>
        {m.note ? <Text style={styles.note}>{m.note}</Text> : null}
      </View>

      {m.warnings.map((w, i) => (
        <View key={i} style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={16} color="#92400e" />
          <Text style={styles.warnText}>{warningText(w)}</Text>
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.section}>
          {t('pioneerMeeting.invitedCount', { count: m.invited.length })}
          {away > 0 ? ` · ${t('pioneerMeeting.awayCount', { count: away })}` : ''}
        </Text>
        {m.invited.length === 0 ? (
          <Text style={styles.empty}>{t('pioneerMeeting.nobody')}</Text>
        ) : (
          m.invited.map((p) => (
            <View key={p.id} style={styles.person}>
              <Text style={[styles.name, p.away && { color: '#94a3b8' }]}>{p.name}</Text>
              <Text style={styles.kind}>
                {p.away ? t('pioneerMeeting.away') : t(`publishers.pioneer.detail.${p.kind}`)}
              </Text>
            </View>
          ))
        )}
        <Text style={styles.hint}>{t('pioneerMeeting.whoHint')}</Text>
      </View>

      {m.canManage ? (
        <View style={{ gap: 8 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => setEditing(true)} style={styles.btn} accessibilityRole="button">
            <Text style={styles.btnText}>{t('pioneerMeeting.edit')}</Text>
          </Pressable>
          <Pressable onPress={() => void cancel()} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('pioneerMeeting.cancel')}</Text>
          </Pressable>
        </View>
      ) : null}

      <PioneerMeetingForm
        visible={editing}
        meeting={m}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          qc.setQueryData(['pioneer-meeting', id], next);
          void qc.invalidateQueries({ queryKey: ['pioneer-meetings'] });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hero: { backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: '#a5f3fc', padding: 18, gap: 4 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: '#94a3b8' },
  when: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: INK, marginTop: 4 },
  sub: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#334155' },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  by: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: BRAND },
  outline: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 4 },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#334155', marginTop: 8, lineHeight: 19 },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 10,
  },
  warnText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 18, color: '#92400e' },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16, gap: 2 },
  section: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginBottom: 6,
  },
  empty: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: MUTED },
  person: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  name: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  kind: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: MUTED },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: MUTED, marginTop: 8 },
  error: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
});
