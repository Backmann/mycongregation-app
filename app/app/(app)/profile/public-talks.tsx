import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  extractErrorMessage,
  PublicTalk,
  publicTalksApi,
} from '../../../lib/api';

type Recency = 'recent' | 'caution' | 'ok' | 'never';

function getRecency(lastGivenAt: string | null): Recency {
  if (!lastGivenAt) return 'never';
  const monthsAgo =
    (Date.now() - new Date(lastGivenAt).getTime()) /
    (1000 * 60 * 60 * 24 * 30);
  if (monthsAgo < 3) return 'recent';
  if (monthsAgo < 6) return 'caution';
  return 'ok';
}

export default function PublicTalksScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const query = useQuery({
    queryKey: ['public-talks', { search, includeInactive: showInactive }],
    queryFn: () =>
      publicTalksApi.list({
        search: search.trim() || undefined,
        includeInactive: showInactive,
        limit: 500,
      }),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['public-talks'] });
    }, [queryClient]),
  );

  const talks = query.data?.data ?? [];
  const total = query.data?.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by number or title…"
          placeholderTextColor="#cbd5e1"
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
          </Pressable>
        )}
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={styles.toggleButton}
          onPress={() => setShowInactive((v) => !v)}
        >
          <Ionicons
            name={showInactive ? 'checkbox' : 'square-outline'}
            size={16}
            color={showInactive ? '#0ea5e9' : '#94a3b8'}
          />
          <Text style={styles.toggleText}>Show retired</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          style={styles.importButton}
          onPress={() => router.push('/profile/public-talks-import' as any)}
        >
          <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
          <Text style={styles.importButtonText}>Bulk import</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
          />
        }
      >
        {query.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : query.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(query.error)}
            </Text>
          </View>
        ) : talks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {search ? 'No talks match your search' : 'No public talks yet'}
            </Text>
            {!search && (
              <Text style={styles.emptySub}>
                Tap "Bulk import" to add the S-34 catalog
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.list}>
            <Text style={styles.totalText}>
              {total} {total === 1 ? 'talk' : 'talks'}
              {search ? ` matching "${search}"` : ''}
            </Text>
            {talks.map((talk) => (
              <TalkRow key={talk.id} talk={talk} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TalkRow({ talk }: { talk: PublicTalk }) {
  const recency = getRecency(talk.lastGivenAt);
  const recencyColor: Record<Recency, string> = {
    recent: '#dc2626',
    caution: '#d97706',
    ok: '#94a3b8',
    never: '#cbd5e1',
  };
  const recencyIcon: Record<Recency, any> = {
    recent: 'warning',
    caution: 'warning-outline',
    ok: 'time-outline',
    never: 'time-outline',
  };

  return (
    <View style={[styles.row, !talk.isActive && styles.rowInactive]}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{talk.number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.title, !talk.isActive && styles.titleInactive]}
          numberOfLines={2}
        >
          {talk.title}
        </Text>
        {!talk.isActive && <Text style={styles.retiredLabel}>Retired</Text>}
        {talk.lastGivenAt && (
          <View style={styles.hintRow}>
            <Ionicons
              name={recencyIcon[recency]}
              size={11}
              color={recencyColor[recency]}
            />
            <Text style={[styles.hintText, { color: recencyColor[recency] }]}>
              Last given {talk.lastGivenAt}
              {talk.lastGivenBy ? ` · ${talk.lastGivenBy}` : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  toggleText: { fontSize: 13, color: '#64748b' },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
  },
  importButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  empty: { paddingVertical: 64, alignItems: 'center' },
  emptyTitle: {
    fontSize: 16,
    color: '#475569',
    marginTop: 12,
    fontWeight: '500',
  },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  list: { backgroundColor: '#fff' },
  totalText: {
    fontSize: 12,
    color: '#64748b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowInactive: { opacity: 0.55 },
  numberBadge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  numberText: { fontSize: 13, fontWeight: '700', color: '#0369a1' },
  title: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  titleInactive: { textDecorationLine: 'line-through', color: '#64748b' },
  retiredLabel: {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 2,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  hintText: { fontSize: 11 },

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
