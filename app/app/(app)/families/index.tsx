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
import { extractErrorMessage, Family, familiesApi } from '../../../lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function FamiliesListScreen() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['families', search],
    queryFn: () => familiesApi.list({ search: search || undefined }),
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
              {search ? 'No matches' : 'No families yet'}
            </Text>
          }
          ListHeaderComponent={
            data ? <Text style={styles.count}>{data.total} total</Text> : null
          }
          renderItem={({ item }) => <FamilyRow family={item} />}
        />
      )}
    </View>
  );
}

function FamilyRow({ family }: { family: Family }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/families/${family.id}` as any)}
    >
      <View style={styles.icon}>
        <Ionicons name="home" color="#0ea5e9" size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{family.name}</Text>
        {family.notes && (
          <Text style={styles.notes} numberOfLines={1}>
            {family.notes}
          </Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

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
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  notes: { fontSize: 13, color: '#64748b', marginTop: 2 },
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
