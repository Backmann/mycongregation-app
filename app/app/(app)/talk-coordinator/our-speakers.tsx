import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  ExternalCongregation,
  Publisher,
  PublicTalk,
  externalCongregationsApi,
  publicTalksApi,
  publishersApi,
  talkExchangeApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import {
  computeOutgoingStats,
  OutgoingStats,
  wentOutRecently,
} from '../../../lib/speaker-stats';
import { dayDiff, formatRelativeDay } from '../../../lib/relative-time';

const OVERDUE_DAYS = 120;

export default function OurSpeakersScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'recency' | 'trips' | 'name'>(
    'recency',
  );
  const [filterMode, setFilterMode] = useState<
    'all' | 'upcoming' | 'overdue' | 'never'
  >('all');

  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });
  const congQuery = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });
  const entriesQuery = useQuery({
    queryKey: ['talk-exchange'],
    queryFn: () => talkExchangeApi.list(),
  });

  const today = new Date().toLocaleDateString('en-CA');

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

  // Our speakers = active publishers who either carry the public-talk-speaker
  // capability or already have at least one outgoing trip on record.
  const ourSpeakers = useMemo(() => {
    const withTalk = new Set<string>();
    for (const e of entriesQuery.data ?? [])
      if (e.publisherId) withTalk.add(e.publisherId);
    return (publishersQuery.data?.data ?? []).filter(
      (p) =>
        p.isActive &&
        (p.capabilities?.public_talk_speaker === true || withTalk.has(p.id)),
    );
  }, [publishersQuery.data, entriesQuery.data]);

  const statsById = useMemo(() => {
    const m = new Map<string, OutgoingStats>();
    const entries = entriesQuery.data ?? [];
    for (const p of ourSpeakers)
      m.set(p.id, computeOutgoingStats(p.id, entries, talkById, congById, today));
    return m;
  }, [ourSpeakers, entriesQuery.data, talkById, congById, today]);

  const rows = useMemo(() => {
    let list = [...ourSpeakers];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.displayName.toLowerCase().includes(q));
    if (filterMode !== 'all')
      list = list.filter((p) => {
        const st = statsById.get(p.id);
        if (!st) return false;
        if (filterMode === 'upcoming') return !!st.nextVisit;
        if (filterMode === 'never') return st.count === 0 && !st.nextVisit;
        return (
          !!st.lastVisit &&
          !st.nextVisit &&
          Math.abs(dayDiff(st.lastVisit.date, today)) > OVERDUE_DAYS
        );
      });
    list.sort((a, b) => {
      if (sortMode === 'name')
        return a.displayName.localeCompare(b.displayName);
      if (sortMode === 'trips') {
        const ca = statsById.get(a.id)?.count ?? 0;
        const cb = statsById.get(b.id)?.count ?? 0;
        return cb - ca || a.displayName.localeCompare(b.displayName);
      }
      // recency: longest-since-first (never-out sort to the very top)
      const la = statsById.get(a.id)?.lastVisit?.date ?? '';
      const lb = statsById.get(b.id)?.lastVisit?.date ?? '';
      return la.localeCompare(lb) || a.displayName.localeCompare(b.displayName);
    });
    return list;
  }, [ourSpeakers, search, filterMode, sortMode, statsById, today]);

  if (!perms.canCoordinatePublicTalks) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('talkCoordinator.noAccess')}</Text>
      </View>
    );
  }

  const loading =
    publishersQuery.isLoading ||
    entriesQuery.isLoading ||
    talksQuery.isLoading ||
    congQuery.isLoading;

  const appointmentLabel = (p: Publisher) =>
    p.appointment === 'elder' || p.appointment === 'ministerial_servant'
      ? t(`appointment.${p.appointment}`)
      : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>{t('talkCoordinator.ourSpeakers.hint')}</Text>

        <View style={styles.toolbar}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('talkCoordinator.ourSpeakers.searchPlaceholder')}
              placeholderTextColor="#94a3b8"
            />
            {search ? (
              <Pressable hitSlop={8} onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color="#cbd5e1" />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.segmentRow}>
            {(['recency', 'trips', 'name'] as const).map((m) => (
              <Pressable
                key={m}
                style={[styles.segment, sortMode === m && styles.segmentActive]}
                onPress={() => setSortMode(m)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    sortMode === m && styles.segmentTextActive,
                  ]}
                >
                  {t(`talkCoordinator.ourSpeakers.sort.${m}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.filterRow}>
            {(['all', 'upcoming', 'overdue', 'never'] as const).map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.filterChip,
                  filterMode === m && styles.filterChipActive,
                ]}
                onPress={() => setFilterMode(m)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterMode === m && styles.filterChipTextActive,
                  ]}
                >
                  {t(`talkCoordinator.ourSpeakers.filter.${m}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            {search || filterMode !== 'all'
              ? t('talkCoordinator.ourSpeakers.noResults')
              : t('talkCoordinator.ourSpeakers.empty')}
          </Text>
        ) : (
          rows.map((p) => {
            const st = statsById.get(p.id);
            const apt = appointmentLabel(p);
            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() =>
                  router.push(
                    `/talk-coordinator/our-speaker-profile/${p.id}` as any,
                  )
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.displayName}</Text>
                  {apt ? <Text style={styles.sub}>{apt}</Text> : null}
                  {!st || (st.count === 0 && !st.nextVisit) ? (
                    <Text style={styles.statusNever}>
                      {t('talkCoordinator.ourSpeakers.status.never')}
                    </Text>
                  ) : (
                    <View style={styles.statusRow}>
                      {st.count > 0 && st.lastVisit ? (
                        <Text
                          style={[
                            styles.statusText,
                            wentOutRecently(st, today) && styles.statusRecent,
                          ]}
                        >
                          {t('talkCoordinator.ourSpeakers.status.lastSeen', {
                            count: st.count,
                            rel: formatRelativeDay(st.lastVisit.date, today, t),
                          })}
                        </Text>
                      ) : null}
                      {st.nextVisit ? (
                        <View style={styles.upcomingTag}>
                          <Ionicons name="airplane" size={11} color="#0369a1" />
                          <Text style={styles.upcomingText}>
                            {formatRelativeDay(st.nextVisit.date, today, t)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 },

  toolbar: { marginBottom: 12, gap: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 2,
  },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  segmentTextActive: { color: '#0f172a', fontWeight: '700' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  filterChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  filterChipText: { fontSize: 13, color: '#475569' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { fontSize: 13, color: '#475569', marginTop: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3,
  },
  statusText: { fontSize: 13, color: '#64748b' },
  statusRecent: { color: '#b45309', fontWeight: '600' },
  statusNever: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 3 },
  upcomingTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  upcomingText: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
});
