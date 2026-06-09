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
import dayjs from 'dayjs';
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

function EventRow({ event }: { event: SpecialEvent }) {
  const { t, i18n } = useTranslation();
  const isRemoved = !!event.deletedAt;
  const start = dayjs(`${event.date}T00:00:00`);
  const day = start.toDate().toLocaleDateString(i18n.language, {
    day: '2-digit',
  });
  const mon = start.toDate().toLocaleDateString(i18n.language, {
    month: 'short',
  });

  const rangeText = event.endDate
    ? `${start.format('DD.MM')} – ${dayjs(event.endDate).format('DD.MM.YYYY')}`
    : null;
  const meta =
    [rangeText, event.time, event.address].filter(Boolean).join(' · ') ||
    t('specialEvents.upcoming');

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/special-events/${event.id}` as any)}
    >
      <View style={styles.dateBadge}>
        <Text style={styles.dateDay}>{day}</Text>
        <Text style={styles.dateMon}>{mon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.title, isRemoved && styles.removedText]}
          numberOfLines={1}
        >
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
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
  dateBadge: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingVertical: 6,
  },
  dateDay: { fontSize: 18, fontWeight: '700', color: '#0369a1' },
  dateMon: { fontSize: 11, color: '#0369a1', textTransform: 'uppercase' },
  title: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  removedText: { textDecorationLine: 'line-through', color: '#94a3b8' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  hint: { fontSize: 12, color: '#b45309', marginTop: 2 },
});
