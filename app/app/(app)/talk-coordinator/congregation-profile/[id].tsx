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
import dayjs from 'dayjs';
import {
  externalCongregationsApi,
  PublicTalk,
  publicTalksApi,
  talkExchangeApi,
  visitingSpeakersApi,
} from '../../../../lib/api';
import {
  computeSpeakerStats,
  visitedRecently,
} from '../../../../lib/speaker-stats';
import { formatRelativeDay } from '../../../../lib/relative-time';
import { LoadError } from '../../../../components/LoadError';

const todayISO = () => new Date().toLocaleDateString('en-CA');

/**
 * One congregation, and the speakers who belong to it.
 *
 * The directory used to be a dead end: the rows looked like a way in and led
 * nowhere, so "who can come from Bochum, and when was he last here?" could
 * only be answered by typing the name into a search on another screen. The
 * link between a speaker and his congregation has existed in the data all
 * along; this is simply the screen that shows it.
 *
 * The flat speakers list keeps its own job — planning across ALL congregations,
 * "who has not been for a while" — which is a question nobody asks one
 * congregation at a time. This is a second door to the same data, not a
 * replacement for that one.
 */
export default function CongregationProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const today = todayISO();

  const congQuery = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const speakersQuery = useQuery({
    queryKey: ['visiting-speakers'],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const entriesQuery = useQuery({
    queryKey: ['talk-exchange'],
    queryFn: () => talkExchangeApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks'],
    queryFn: () => publicTalksApi.list({ limit: 200 }),
  });

  const congregation = useMemo(
    () => (congQuery.data ?? []).find((c) => c.id === id) ?? null,
    [congQuery.data, id],
  );

  const talkById = useMemo(() => {
    const m = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) m.set(tk.id, tk);
    return m;
  }, [talksQuery.data]);

  // His speakers, most recently with us first — the order a coordinator reads
  // when deciding whom to invite next.
  const speakers = useMemo(() => {
    const mine = (speakersQuery.data ?? []).filter(
      (s) => s.externalCongregationId === id,
    );
    const entries = entriesQuery.data ?? [];
    return mine
      .map((s) => ({
        speaker: s,
        stats: computeSpeakerStats(s, entries, talkById, today),
      }))
      .sort((a, b) => {
        const ka = a.stats.lastVisit?.date ?? '';
        const kb = b.stats.lastVisit?.date ?? '';
        if (ka !== kb) return kb.localeCompare(ka);
        return `${a.speaker.lastName ?? ''} ${a.speaker.firstName}`.localeCompare(
          `${b.speaker.lastName ?? ''} ${b.speaker.firstName}`,
        );
      });
  }, [speakersQuery.data, entriesQuery.data, talkById, id, today]);

  const loading =
    congQuery.isLoading || speakersQuery.isLoading || entriesQuery.isLoading;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (congQuery.isError) {
    return <LoadError onRetry={() => congQuery.refetch()} />;
  }
  if (!congregation) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>
          {t('talkCoordinator.congregationProfile.notFound')}
        </Text>
      </View>
    );
  }

  const dayLabel = (dow: number) =>
    dayjs('2024-01-01')
      .add(dow - 1, 'day')
      .locale(i18n.language)
      .format('dd');

  const meeting = [
    congregation.meetingDow ? dayLabel(congregation.meetingDow) : null,
    congregation.meetingTime,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.name}>{congregation.name}</Text>
        {!!congregation.city && (
          <Text style={styles.sub}>{congregation.city}</Text>
        )}
        {!!meeting && (
          <View style={styles.dayBadge}>
            <Ionicons name="calendar-outline" size={12} color="#0369a1" />
            <Text style={styles.dayBadgeText}>{meeting}</Text>
          </View>
        )}
        {!!congregation.address && (
          <Text style={styles.line}>{congregation.address}</Text>
        )}
        {(congregation.contactName || congregation.contactPhone) && (
          <Pressable
            disabled={!congregation.contactPhone}
            onPress={() =>
              congregation.contactPhone &&
              Linking.openURL(`tel:${congregation.contactPhone}`)
            }
          >
            <Text
              style={[styles.line, !!congregation.contactPhone && styles.link]}
            >
              {[congregation.contactName, congregation.contactPhone]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        )}
        {!!congregation.note && (
          <Text style={styles.note}>{congregation.note}</Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>
        {t('talkCoordinator.congregationProfile.speakers')}
      </Text>

      <View style={styles.card}>
        {speakers.length === 0 ? (
          <Text style={styles.empty}>
            {t('talkCoordinator.congregationProfile.noSpeakers')}
          </Text>
        ) : (
          speakers.map(({ speaker, stats }, idx) => {
            const never = stats.count === 0 && !stats.nextVisit;
            const recent = visitedRecently(stats, today);
            return (
              <Pressable
                key={speaker.id}
                style={({ pressed }) => [
                  styles.row,
                  idx > 0 && styles.rowDivided,
                  pressed && styles.rowPressed,
                ]}
                onPress={() =>
                  router.push(
                    `/talk-coordinator/speaker-profile/${speaker.id}` as never,
                  )
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.speakerName}>
                    {[speaker.firstName, speaker.lastName]
                      .filter(Boolean)
                      .join(' ')}
                  </Text>
                  {never ? (
                    <Text style={styles.statusNever}>
                      {t('talkCoordinator.speakers.status.never')}
                    </Text>
                  ) : (
                    <View style={styles.statusRow}>
                      {stats.count > 0 && stats.lastVisit ? (
                        <Text
                          style={[
                            styles.statusText,
                            recent && styles.statusRecent,
                          ]}
                        >
                          {t('talkCoordinator.speakers.status.lastSeen', {
                            count: stats.count,
                            rel: formatRelativeDay(
                              stats.lastVisit.date,
                              today,
                              t,
                            ),
                          })}
                        </Text>
                      ) : null}
                      {stats.nextVisit ? (
                        <View style={styles.upcomingTag}>
                          <Ionicons name="airplane" size={11} color="#0369a1" />
                          <Text style={styles.upcomingText}>
                            {formatRelativeDay(stats.nextVisit.date, today, t)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </Pressable>
            );
          })
        )}
      </View>

      {/* Adding from here saves choosing the congregation again — it is
          already known, and choosing it by hand is how a speaker ends up
          filed under the wrong one. */}
      <Pressable
        style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        onPress={() =>
          router.push(
            `/talk-coordinator/speakers?congregationId=${congregation.id}` as never,
          )
        }
      >
        <Ionicons name="person-add-outline" size={18} color="#0369a1" />
        <Text style={styles.addBtnText}>
          {t('talkCoordinator.congregationProfile.addSpeaker')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 4 },
  name: {
    fontSize: 18,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  sub: { fontSize: 13, color: '#64748b' },
  line: { fontSize: 13.5, color: '#334155', marginTop: 2 },
  link: { color: '#0369a1' },
  note: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 4 },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  dayBadgeText: {
    fontSize: 11.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  sectionLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  rowPressed: { opacity: 0.6 },
  speakerName: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  statusText: { fontSize: 12, color: '#64748b' },
  statusRecent: { color: '#15803d' },
  statusNever: { fontSize: 12, color: '#b45309', marginTop: 2 },
  upcomingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  upcomingText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  empty: { fontSize: 13.5, color: '#94a3b8', paddingVertical: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 13,
  },
  addBtnPressed: { opacity: 0.7 },
  addBtnText: {
    fontSize: 14.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
});
