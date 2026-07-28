import { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import { serviceOverseerApi, publishersApi } from '../../../lib/api';

/**
 * Which groups the service overseer has visited this service year, and which
 * still wait.
 *
 * Deliberately a list of GROUPS rather than a list of visits. The obligation
 * is «every group at least once a year», and a visit log is something people
 * open in August and discover two groups were missed. A group with the answer
 * beside its name can be acted on in March, which is the whole point.
 */
export default function ServiceOverseerScreen() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  const visitsQuery = useQuery({
    queryKey: ['service-overseer', 'group-visits'],
    queryFn: () => serviceOverseerApi.groupVisits(),
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({}),
  });

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of publishersQuery.data?.data ?? []) {
      map.set(p.id, `${p.lastName} ${p.firstName}`.trim());
    }
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  }, [publishersQuery.data]);

  const groups = visitsQuery.data?.groups ?? [];
  const waiting = groups.filter((g) => g.visitsThisYear === 0);

  const fmt = (iso: string) => dayjs(iso).locale(language).format('D MMMM YYYY');

  if (visitsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Facts, no scolding, and gone entirely when every group has been
          visited — the same line the CO schedule uses for what is still
          unassigned. An empty «всё хорошо» panel would take up room every
          time for the sake of one occasion. */}
      {waiting.length > 0 ? (
        <View style={styles.waitingCard}>
          <View style={styles.waitingHead}>
            <Ionicons name="walk-outline" size={15} color="#92400e" />
            <Text style={styles.waitingTitle}>
              {t('serviceOverseer.waitingTitle')}
            </Text>
          </View>
          <Text style={styles.waitingBody}>
            {waiting.map((g) => g.name).join(' · ')}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        {t('serviceOverseer.yearLabel', {
          year: visitsQuery.data?.serviceYear ?? '',
        })}
      </Text>

      {groups.map((g) => {
        const visited = g.visitsThisYear > 0;
        return (
          <View
            key={g.serviceGroupId}
            style={[styles.row, visited && styles.rowDone]}
          >
            <View style={styles.rowHead}>
              <Text style={styles.groupName}>{g.name}</Text>
              <View style={[styles.count, visited && styles.countDone]}>
                <Text style={[styles.countText, visited && styles.countTextDone]}>
                  {g.visitsThisYear}
                </Text>
              </View>
            </View>

            <Text style={styles.line}>
              {g.lastVisitDate
                ? t('serviceOverseer.last', {
                    date: fmt(g.lastVisitDate),
                    who: nameOf(g.lastVisitBy) ?? '—',
                  })
                : t('serviceOverseer.never')}
            </Text>

            {/* A planned visit is stated separately from one already made: a
                group is not covered by something that has not happened. */}
            {g.nextVisitDate ? (
              <Text style={styles.planned}>
                {t('serviceOverseer.planned', { date: fmt(g.nextVisitDate) })}
              </Text>
            ) : null}
          </View>
        );
      })}

      {groups.length === 0 ? (
        <Text style={styles.muted}>{t('serviceOverseer.noGroups')}</Text>
      ) : null}

      <Text style={styles.hint}>{t('serviceOverseer.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  waitingCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 5,
  },
  waitingHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitingTitle: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  waitingBody: { fontSize: 13.5, color: '#78350f', lineHeight: 19 },
  sectionTitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 6,
  },
  row: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    gap: 3,
  },
  // Visited this year: quieter, but still present. A second visit happens; it
  // is simply not urgent, and hiding the group would hide that it happened.
  rowDone: { backgroundColor: '#f8fafc' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  count: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
  },
  countDone: { backgroundColor: '#dcfce7' },
  countText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  countTextDone: { color: '#15803d' },
  line: { fontSize: 13.5, color: '#475569' },
  planned: { fontSize: 13, color: '#0369a1' },
  muted: { fontSize: 14, color: '#64748b' },
  hint: { fontSize: 12.5, color: '#94a3b8', lineHeight: 18, marginTop: 8 },
});
