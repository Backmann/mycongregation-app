import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  ExternalCongregation,
  PublicTalk,
  externalCongregationsApi,
  publicTalksApi,
  publishersApi,
  talkExchangeApi,
} from '../../../../lib/api';
import {
  computeOutgoingStats,
  OutgoingVisit,
  wentOutRecently,
} from '../../../../lib/speaker-stats';
import { formatRelativeDay } from '../../../../lib/relative-time';

const todayISO = () => new Date().toLocaleDateString('en-CA');

export default function OurSpeakerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();

  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });
  const congQuery = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const entriesQuery = useQuery({
    queryKey: ['talk-exchange'],
    queryFn: () => talkExchangeApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const publisher =
    (publishersQuery.data?.data ?? []).find((p) => p.id === id) ?? null;

  const talkById = useMemo(() => {
    const m = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) m.set(tk.id, tk);
    return m;
  }, [talksQuery.data]);
  const congById = useMemo(() => {
    const m = new Map<string, ExternalCongregation>();
    for (const c of congQuery.data ?? []) m.set(c.id, c);
    return m;
  }, [congQuery.data]);

  const today = todayISO();
  const stats = useMemo(
    () =>
      publisher
        ? computeOutgoingStats(
            publisher.id,
            entriesQuery.data ?? [],
            talkById,
            congById,
            today,
          )
        : null,
    [publisher, entriesQuery.data, talkById, congById, today],
  );

  const loading =
    publishersQuery.isLoading ||
    congQuery.isLoading ||
    entriesQuery.isLoading ||
    talksQuery.isLoading;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!publisher || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {t('talkCoordinator.ourSpeakerProfile.notFound')}
        </Text>
      </View>
    );
  }

  const recent = wentOutRecently(stats, today);
  const phone = publisher.mobilePhone;
  const appointmentLabel =
    publisher.appointment === 'elder' ||
    publisher.appointment === 'ministerial_servant'
      ? t(`publishers.appointment.${publisher.appointment}`)
      : null;

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const renderVisit = (v: OutgoingVisit) => (
    <View key={v.id} style={styles.visitRow}>
      <View style={styles.visitDateCol}>
        <Text style={styles.visitDate}>{fmtDate(v.date)}</Text>
        <Text style={styles.visitRel}>{formatRelativeDay(v.date, today, t)}</Text>
      </View>
      <View style={styles.visitTalkCol}>
        <Text style={styles.visitHost} numberOfLines={1}>
          {v.local
            ? t('talkCoordinator.ourSpeakerProfile.here')
            : (v.hostCongregation ??
              t('talkCoordinator.ourSpeakerProfile.noCongregation'))}
        </Text>
        {v.talkNumber != null ? (
          <Text style={styles.visitTalk} numberOfLines={2}>
            <Text style={styles.visitNum}>№{v.talkNumber}</Text>
            {v.talkTitle ? ` — ${v.talkTitle}` : ''}
          </Text>
        ) : (
          <Text style={styles.visitTalkMuted}>
            {t('talkCoordinator.ourSpeakerProfile.noTalk')}
          </Text>
        )}
        {v.tentative ? (
          <Text style={styles.tentative}>
            {t('talkCoordinator.ourSpeakerProfile.tentative')}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.card}>
        <Text style={styles.name}>{publisher.displayName}</Text>
        {appointmentLabel ? (
          <Text style={styles.cong}>{appointmentLabel}</Text>
        ) : null}
        {phone ? (
          <Pressable
            style={styles.phoneRow}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          >
            <Ionicons name="call-outline" size={15} color="#0369a1" />
            <Text style={styles.phone}>{phone}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Stats band */}
      <View style={[styles.statsBand, recent && styles.statsBandRecent]}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{stats.count}</Text>
          <Text style={styles.statLabel}>
            {t('talkCoordinator.ourSpeakerProfile.timesOut')}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statText, recent && styles.statTextRecent]}>
            {stats.lastVisit
              ? formatRelativeDay(stats.lastVisit.date, today, t)
              : t('talkCoordinator.ourSpeakerProfile.never')}
          </Text>
          <Text style={styles.statLabel}>
            {t('talkCoordinator.ourSpeakerProfile.lastTime')}
          </Text>
        </View>
        {stats.distinctCongregations > 0 ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{stats.distinctCongregations}</Text>
              <Text style={styles.statLabel}>
                {t('talkCoordinator.ourSpeakerProfile.congregations')}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {recent ? (
        <View style={styles.recentWarn}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.recentWarnText}>
            {t('talkCoordinator.ourSpeakerProfile.recentWarning')}
          </Text>
        </View>
      ) : null}

      {/* Upcoming */}
      <Text style={styles.sectionTitle}>
        {t('talkCoordinator.ourSpeakerProfile.upcoming')}
      </Text>
      <View style={styles.card}>
        {stats.futureVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t('talkCoordinator.ourSpeakerProfile.noUpcoming')}
          </Text>
        ) : (
          stats.futureVisits.map(renderVisit)
        )}
      </View>

      {/* History */}
      <Text style={styles.sectionTitle}>
        {t('talkCoordinator.ourSpeakerProfile.history')}
      </Text>
      <View style={styles.card}>
        {stats.pastVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t('talkCoordinator.ourSpeakerProfile.noHistory')}
          </Text>
        ) : (
          stats.pastVisits.map(renderVisit)
        )}
      </View>

      {/* Repertoire (derived from history) */}
      {stats.repertoire.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {t('talkCoordinator.ourSpeakerProfile.repertoire')}
          </Text>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {stats.repertoire.map((r) => (
                <View key={r.talkNumber} style={styles.talkChip}>
                  <Text style={styles.talkChipText}>№{r.talkNumber}</Text>
                  {r.count > 1 ? (
                    <Text style={styles.talkChipCount}>×{r.count}</Text>
                  ) : null}
                </View>
              ))}
            </View>
            <Text style={styles.repertoireLegend}>
              {t('talkCoordinator.ourSpeakerProfile.repertoireHint', {
                n: stats.repertoire.length,
              })}
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  container: { padding: 16, paddingBottom: 48 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 14,
  },
  name: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  cong: { fontSize: 14, color: '#475569', marginTop: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  phone: { fontSize: 15, color: '#0369a1' },

  statsBand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    marginBottom: 14,
  },
  statsBandRecent: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  statDivider: { width: 1, backgroundColor: '#e2e8f0' },
  statNum: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  statText: { fontSize: 14, fontWeight: '600', color: '#0f172a', textAlign: 'center' },
  statTextRecent: { color: '#b45309' },
  statLabel: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },

  recentWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    marginTop: -4,
    marginBottom: 14,
  },
  recentWarnText: { flex: 1, fontSize: 13, color: '#92400e' },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionEmpty: { fontSize: 14, color: '#94a3b8' },

  visitRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  visitDateCol: { width: 96 },
  visitDate: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  visitRel: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  visitTalkCol: { flex: 1 },
  visitHost: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  visitTalk: { fontSize: 13, color: '#475569', lineHeight: 18, marginTop: 1 },
  visitNum: { fontWeight: '700', color: '#0369a1' },
  visitTalkMuted: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 1 },
  tentative: { fontSize: 11, color: '#b45309', marginTop: 2 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  talkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0369a1',
    backgroundColor: '#eff6ff',
  },
  talkChipText: { fontSize: 13, fontWeight: '600', color: '#0369a1' },
  talkChipCount: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  repertoireLegend: { fontSize: 12, color: '#94a3b8', marginTop: 10 },
});
