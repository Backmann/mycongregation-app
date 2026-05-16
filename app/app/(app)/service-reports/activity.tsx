import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  activityApi,
  ActivityFeedEntry,
  extractErrorMessage,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return i18n.t('common.time.justNow');
  if (diff < 3600) return i18n.t('common.time.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('common.time.hoursAgo', { count: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return i18n.t('common.time.daysAgo', { count: Math.floor(diff / 86400) });
  return d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
}

type IconSpec = { name: any; color: string };

function iconFor(type: ActivityFeedEntry['type']): IconSpec {
  switch (type) {
    case 'status_change':
      return { name: 'sync-circle', color: '#0ea5e9' };
    case 'report_submitted':
      return { name: 'document-text', color: '#22c55e' };
    case 'report_updated':
      return { name: 'pencil', color: '#eab308' };
    case 'override_applied':
      return { name: 'lock-closed', color: '#a855f7' };
    case 'override_cleared':
      return { name: 'lock-open', color: '#94a3b8' };
    default:
      return { name: 'ellipse', color: '#64748b' };
  }
}

function ActivityCard({ item }: { item: ActivityFeedEntry }) {
  const icon = iconFor(item.type);
  const onTap = () => {
    if (item.targetType === 'publisher') {
      router.push(
        `/service-reports/publisher-history?publisherId=${item.targetId}` as any,
      );
    } else if (item.targetType === 'service_report') {
      router.push(
        `/service-reports/new?editId=${item.targetId}` as any,
      );
    }
  };

  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.iconWrap, { backgroundColor: icon.color + '20' }]}>
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.body}>
        <Text style={styles.summary}>{item.summary}</Text>
        <Text style={styles.meta}>
          {formatRelativeTime(item.occurredAt)}
          {item.actorName ? ` · ${item.actorName}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

export default function ActivityFeedScreen() {
  const query = useInfiniteQuery({
    queryKey: ['activity-feed'],
    queryFn: ({ pageParam }) =>
      activityApi.list({ limit: 20, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (query.error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{extractErrorMessage(query.error)}</Text>
        </View>
      </View>
    );
  }

  const allItems = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      data={allItems}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ActivityCard item={item} />}
      contentContainerStyle={styles.list}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="pulse-outline" size={48} color="#94a3b8" />
          <Text style={styles.emptyText}>{i18n.t('activity.noActivity')}</Text>
          <Text style={styles.emptyHint}>
            {i18n.t('activity.noActivityHint')}
          </Text>
        </View>
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, padding: 16 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardPressed: {
    backgroundColor: '#f1f5f9',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  body: { flex: 1, marginRight: 8 },
  summary: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { color: '#64748b', marginTop: 12, fontSize: 16 },
  emptyHint: {
    color: '#94a3b8',
    marginTop: 4,
    fontSize: 12,
    textAlign: 'center',
  },
  footer: { padding: 16 },
  errorBox: { padding: 16, backgroundColor: '#fee2e2', borderRadius: 8 },
  errorText: { color: '#991b1b' },
});
