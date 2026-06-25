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
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  PublicTalk,
  publicTalksApi,
  talkExchangeApi,
  visitingSpeakersApi,
} from '../../../../lib/api';
import {
  computeSpeakerStats,
  SpeakerVisit,
  visitedRecently,
} from '../../../../lib/speaker-stats';
import { formatRelativeDay } from '../../../../lib/relative-time';

const todayISO = () => new Date().toLocaleDateString('en-CA');

export default function SpeakerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();

  const speakersQuery = useQuery({
    queryKey: ['visiting-speakers'],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const entriesQuery = useQuery({
    queryKey: ['talk-exchange'],
    queryFn: () => talkExchangeApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const speaker = (speakersQuery.data ?? []).find((s) => s.id === id) ?? null;

  const talkById = useMemo(() => {
    const m = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) m.set(tk.id, tk);
    return m;
  }, [talksQuery.data]);

  const today = todayISO();
  const stats = useMemo(
    () =>
      speaker
        ? computeSpeakerStats(speaker, entriesQuery.data ?? [], talkById, today)
        : null,
    [speaker, entriesQuery.data, talkById, today],
  );

  const loading =
    speakersQuery.isLoading || entriesQuery.isLoading || talksQuery.isLoading;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!speaker || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {t('talkCoordinator.speakerProfile.notFound')}
        </Text>
      </View>
    );
  }

  const name = [speaker.firstName, speaker.lastName].filter(Boolean).join(' ');
  const recent = visitedRecently(stats, today);
  const phone = speaker.phone;

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const avgLabel =
    stats.avgIntervalDays == null
      ? null
      : stats.avgIntervalDays < 14
        ? t('relative.d', { n: stats.avgIntervalDays })
        : stats.avgIntervalDays < 60
          ? t('relative.w', { n: Math.round(stats.avgIntervalDays / 7) })
          : t('relative.mo', { n: Math.round(stats.avgIntervalDays / 30.44) });

  const renderVisit = (v: SpeakerVisit) => (
    <View key={v.id} style={styles.visitRow}>
      <View style={styles.visitDateCol}>
        <Text style={styles.visitDate}>{fmtDate(v.date)}</Text>
        <Text style={styles.visitRel}>{formatRelativeDay(v.date, today, t)}</Text>
      </View>
      <View style={styles.visitTalkCol}>
        {v.talkNumber != null ? (
          <Text style={styles.visitTalk} numberOfLines={2}>
            <Text style={styles.visitNum}>№{v.talkNumber}</Text>
            {v.talkTitle ? ` — ${v.talkTitle}` : ''}
          </Text>
        ) : (
          <Text style={styles.visitTalkMuted}>
            {t('talkCoordinator.speakerProfile.noTalk')}
          </Text>
        )}
        {v.tentative ? (
          <Text style={styles.tentative}>
            {t('talkCoordinator.speakerProfile.tentative')}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.card}>
        <Text style={styles.name}>{name}</Text>
        {speaker.externalCongregation ? (
          <Text style={styles.cong}>{speaker.externalCongregation.name}</Text>
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
        {speaker.note ? <Text style={styles.note}>{speaker.note}</Text> : null}
      </View>

      {/* Stats band */}
      <View style={[styles.statsBand, recent && styles.statsBandRecent]}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{stats.count}</Text>
          <Text style={styles.statLabel}>
            {t('talkCoordinator.speakerProfile.timesHere')}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statText, recent && styles.statTextRecent]}>
            {stats.lastVisit
              ? formatRelativeDay(stats.lastVisit.date, today, t)
              : t('talkCoordinator.speakerProfile.never')}
          </Text>
          <Text style={styles.statLabel}>
            {t('talkCoordinator.speakerProfile.lastTime')}
          </Text>
        </View>
        {avgLabel ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statText}>~{avgLabel}</Text>
              <Text style={styles.statLabel}>
                {t('talkCoordinator.speakerProfile.avgInterval')}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {recent ? (
        <View style={styles.recentWarn}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.recentWarnText}>
            {t('talkCoordinator.speakerProfile.recentWarning')}
          </Text>
        </View>
      ) : null}

      {/* Upcoming */}
      <Text style={styles.sectionTitle}>
        {t('talkCoordinator.speakerProfile.upcoming')}
      </Text>
      <View style={styles.card}>
        {stats.futureVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t('talkCoordinator.speakerProfile.noUpcoming')}
          </Text>
        ) : (
          stats.futureVisits.map(renderVisit)
        )}
      </View>

      {/* History */}
      <Text style={styles.sectionTitle}>
        {t('talkCoordinator.speakerProfile.history')}
      </Text>
      <View style={styles.card}>
        {stats.pastVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t('talkCoordinator.speakerProfile.noHistory')}
          </Text>
        ) : (
          stats.pastVisits.map(renderVisit)
        )}
      </View>

      {/* Repertoire */}
      {speaker.talkNumbers.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {t('talkCoordinator.speakerProfile.repertoire')}
          </Text>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {[...speaker.talkNumbers]
                .sort((a, b) => a - b)
                .map((n) => {
                  const given = stats.givenTalkNumbers.has(n);
                  return (
                    <View
                      key={n}
                      style={[styles.talkChip, given && styles.talkChipGiven]}
                    >
                      {given ? (
                        <Ionicons
                          name="checkmark"
                          size={12}
                          color="#94a3b8"
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.talkChipText,
                          given && styles.talkChipTextGiven,
                        ]}
                      >
                        №{n}
                      </Text>
                    </View>
                  );
                })}
            </View>
            <Text style={styles.repertoireLegend}>
              {t('talkCoordinator.speakerProfile.repertoireLegend', {
                fresh: stats.freshTalkNumbers.length,
              })}
            </Text>
          </View>
        </>
      ) : null}

      {/* Edit */}
      <Pressable
        style={styles.editBtn}
        onPress={() =>
          router.push(`/talk-coordinator/speakers?edit=${speaker.id}` as any)
        }
      >
        <Ionicons name="create-outline" size={18} color="#0369a1" />
        <Text style={styles.editBtnText}>
          {t('talkCoordinator.speakerProfile.edit')}
        </Text>
      </Pressable>
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
  note: { fontSize: 14, color: '#475569', marginTop: 10, lineHeight: 19 },

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
  visitTalk: { fontSize: 14, color: '#0f172a', lineHeight: 19 },
  visitNum: { fontWeight: '700', color: '#0369a1' },
  visitTalkMuted: { fontSize: 14, color: '#94a3b8', fontStyle: 'italic' },
  tentative: { fontSize: 11, color: '#b45309', marginTop: 2 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  talkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#0369a1',
    backgroundColor: '#eff6ff',
  },
  talkChipGiven: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  talkChipText: { fontSize: 13, fontWeight: '600', color: '#0369a1' },
  talkChipTextGiven: { color: '#94a3b8', fontWeight: '500' },
  repertoireLegend: { fontSize: 12, color: '#94a3b8', marginTop: 10 },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0369a1',
    backgroundColor: '#fff',
  },
  editBtnText: { fontSize: 15, fontWeight: '600', color: '#0369a1' },
});
