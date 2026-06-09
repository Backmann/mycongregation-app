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
import { Absence, absencesApi, extractErrorMessage } from '../../../lib/api';
import { FilterToggle } from '../../../components/FilterToggle';

function fmtRange(a: Absence, loc: string): string {
  const start = new Date(`${a.startDate}T00:00:00`);
  if (!a.endDate) {
    return start.toLocaleDateString(loc, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  const end = new Date(`${a.endDate}T00:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const s = start.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const e = end.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${s} – ${e}`;
}

export default function AbsencesListScreen() {
  const { t, i18n } = useTranslation();
  const [showPast, setShowPast] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['absences', showPast, showRemoved],
    queryFn: () =>
      absencesApi.list({ all: showPast, includeRemoved: showRemoved }),
  });

  return (
    <View style={styles.container}>
      <FilterToggle
        label={t('absences.showPast')}
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
            <Text style={styles.empty}>{t('absences.empty')}</Text>
          }
          renderItem={({ item }) => {
            const removed = !!item.deletedAt;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => router.push(`/absences/${item.id}` as any)}
              >
                <Ionicons
                  name="airplane-outline"
                  size={20}
                  color="#0ea5e9"
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.name, removed && styles.removedText]}
                    numberOfLines={1}
                  >
                    {item.publisher?.displayName ?? '—'}
                  </Text>
                  <Text style={styles.dates}>{fmtRange(item, i18n.language)}</Text>
                  {item.note ? (
                    <Text style={styles.note} numberOfLines={1}>
                      {item.note}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </Pressable>
            );
          }}
        />
      )}
    </View>
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
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  removedText: { textDecorationLine: 'line-through', color: '#94a3b8' },
  dates: { fontSize: 13, color: '#0369a1', fontWeight: '500', marginTop: 2 },
  note: { fontSize: 13, color: '#64748b', marginTop: 2 },
});
