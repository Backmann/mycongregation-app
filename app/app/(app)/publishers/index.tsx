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
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';
import {
  extractErrorMessage,
  Publisher,
  publishersApi,
} from '../../../lib/api';
import { FilterToggle } from '../../../components/FilterToggle';

export default function PublishersListScreen() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['publishers', search, showRemoved],
    queryFn: () =>
      publishersApi.list({
        search: search || undefined,
        includeRemoved: showRemoved,
      }),
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder={t('publishers.search')}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FilterToggle
        label={t('publishers.showRemoved')}
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
          data={data?.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search ? t('publishers.noMatches') : t('publishers.noPublishers')}
            </Text>
          }
          ListHeaderComponent={
            data ? (
              <Text style={styles.count}>
                {t('publishers.totalCount', { count: data.total })}
                {search ? ' ' + t('publishers.filteredCount', { count: data.data.length }) : ''}
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
  const isRemoved = !!publisher.deletedAt;

  const tags: string[] = [];
  if (publisher.appointment === 'elder') tags.push(i18n.t('publishers.tags.elder'));
  if (publisher.appointment === 'ministerial_servant') tags.push(i18n.t('publishers.tags.ms'));
  if (publisher.pioneerType === 'regular') tags.push(i18n.t('publishers.tags.regularPioneer'));
  if (publisher.pioneerType === 'special') tags.push(i18n.t('publishers.tags.specialPioneer'));
  if (publisher.pioneerType === 'missionary') tags.push(i18n.t('publishers.tags.missionary'));
  if (publisher.isAnointed) tags.push(i18n.t('publishers.tags.anointed'));
  if (!publisher.isActive) tags.push(i18n.t('publishers.tags.inactive'));

  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        isRemoved && styles.rowRemoved,
      ]}
      onPress={() => router.push(`/publishers/${publisher.id}` as any)}
    >
      <View style={[styles.avatar, gendered(publisher.gender)]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, isRemoved && styles.nameRemoved]}>
            {publisher.displayName}
          </Text>
          {isRemoved && (
            <View style={styles.removedBadge}>
              <Text style={styles.removedBadgeText}>{i18n.t('publishers.removedBadge')}</Text>
            </View>
          )}
        </View>
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
    marginBottom: 8,
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
  rowRemoved: { opacity: 0.55 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  nameRemoved: { textDecorationLine: 'line-through', color: '#64748b' },
  removedBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  removedBadgeText: { color: '#92400e', fontSize: 10, fontWeight: '600' },
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
