import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  extractErrorMessage,
  SpecialEvent,
  specialEventsApi,
} from '../../../lib/api';
import { FilterToggle } from '../../../components/FilterToggle';

export default function SpecialEventsListScreen() {
  const { t } = useTranslation();
  const [showPast, setShowPast] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['special-events', showPast, showRemoved],
    queryFn: () =>
      specialEventsApi.list({ all: showPast, includeRemoved: showRemoved }),
  });

  return (
    <View style={styles.container}>
      <FilterToggle
        label={t('specialEvents.showPast')}
        value={showPast}
        onValueChange={setShowPast}
      />
      <FilterToggle
        label={t('common.showRemoved')}
        value={showRemoved}
        onValueChange={setShowRemoved}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{t('specialEvents.empty')}</Text>
          }
          renderItem={({ item }) => <EventRow event={item} />}
        />
      )}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;

function rangeLabel(start: Date, end: Date, loc: string): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endStr = end.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

function EventRow({ event }: { event: SpecialEvent }) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const isRemoved = !!event.deletedAt;

  const start = new Date(`${event.date}T00:00:00`);
  const end = event.endDate ? new Date(`${event.endDate}T00:00:00`) : null;

  const typeLabel = event.type
    ? t(`specialEvents.types.${event.type}`, event.type)
    : null;
  const meta = [event.time, event.address].filter(Boolean).join(' · ');

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/special-events/${event.id}` as any)}
    >
      {end ? (
        <View style={[styles.dateBadge, styles.dateBadgeRange]}>
          <Text style={styles.rangeNum}>{ddmm(start)}</Text>
          <Ionicons name="arrow-down" size={11} color="#0369a1" />
          <Text style={styles.rangeNum}>{ddmm(end)}</Text>
        </View>
      ) : (
        <View style={styles.dateBadge}>
          <Text style={styles.dateDay}>
            {start.toLocaleDateString(loc, { day: '2-digit' })}
          </Text>
          <Text style={styles.dateMon}>
            {start.toLocaleDateString(loc, { month: 'short' })}
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {typeLabel ? <Text style={styles.typeTag}>{typeLabel}</Text> : null}
        <Text
          style={[styles.title, isRemoved && styles.removedText]}
          numberOfLines={2}
        >
          {event.title}
        </Text>
        {end ? (
          <Text style={styles.dateRange}>{rangeLabel(start, end, loc)}</Text>
        ) : null}
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {event.replacesMeeting ? (
          <Text style={styles.hint}>
            {t('specialEvents.replacesMeetingHint')}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 32 },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#b91c1c' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  dateBadge: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingVertical: 8,
  },
  dateBadgeRange: { paddingVertical: 10 },
  dateDay: { fontSize: 20, fontWeight: '700', color: '#0369a1' },
  dateMon: {
    fontSize: 11,
    color: '#0369a1',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  rangeNum: { fontSize: 14, fontWeight: '700', color: '#0369a1' },
  typeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  removedText: { textDecorationLine: 'line-through', color: '#94a3b8' },
  dateRange: { fontSize: 13, color: '#0369a1', fontWeight: '500', marginTop: 2 },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  hint: { fontSize: 12, color: '#b45309', marginTop: 2 },
});
