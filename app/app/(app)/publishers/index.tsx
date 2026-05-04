import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  extractErrorMessage,
  Publisher,
  publishersApi,
} from '../../../lib/api';

export default function PublishersListScreen() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['publishers', search],
    queryFn: () => publishersApi.list({ search: search || undefined }),
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name…"
        autoCapitalize="none"
        autoCorrect={false}
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
          data={data?.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? 'No matches' : 'No publishers yet'}
            </Text>
          }
          ListHeaderComponent={
            data ? (
              <Text style={styles.count}>
                {data.total} total
                {search ? ` (filtered: ${data.data.length})` : ''}
              </Text>
            ) : null
          }
          renderItem={({ item }) => <PublisherRow publisher={item} />}
        />
      )}
    </View>
  );
}

function PublisherRow({ publisher }: { publisher: Publisher }) {
  const tags: string[] = [];
  if (publisher.appointment === 'elder') tags.push('Elder');
  if (publisher.appointment === 'ministerial_servant') tags.push('MS');
  if (publisher.pioneerType === 'regular') tags.push('Regular pioneer');
  if (publisher.pioneerType === 'special') tags.push('Special pioneer');
  if (publisher.pioneerType === 'missionary') tags.push('Missionary');
  if (publisher.isAnointed) tags.push('Anointed');
  if (!publisher.isActive) tags.push('Inactive');

  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/publishers/${publisher.id}` as any)}
    >
      <View style={[styles.avatar, gendered(publisher.gender)]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{publisher.displayName}</Text>
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {publisher.mobilePhone && (
          <Text style={styles.phone}>{publisher.mobilePhone}</Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const gendered = (g: 'brother' | 'sister') => ({
  backgroundColor: g === 'brother' ? '#0ea5e9' : '#ec4899',
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  search: {
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  count: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    color: '#64748b',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  tag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: { color: '#0369a1', fontSize: 11, fontWeight: '500' },
  phone: { color: '#64748b', fontSize: 13, marginTop: 4 },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 48,
    fontSize: 15,
  },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
});
