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
import i18n from '../../../lib/i18n';
import { monthLabel } from '../../../lib/month-label';

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return i18n.t('common.time.justNow');
  if (diff < 3600) return i18n.t('common.time.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('common.time.hoursAgo', { count: Math.floor(diff / 3600) });
  if (diff < 86400 * 7) return i18n.t('common.time.daysAgo', { count: Math.floor(diff / 86400) });
  return d.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
}

const statusLabel = (s?: string) =>
  s && i18n.exists(`publishers.status.${s}`) ? i18n.t(`publishers.status.${s}`) : (s ?? '—');

/**
 * The line in the reader's language (28 September). The server's `summary`
 * is an English sentence — «vil.natalya updated Виль Наталья» on a Russian
 * phone; the parts it is made of come alongside, and the sentence is put
 * together here. An entry of a kind this build does not know keeps the
 * server's sentence.
 */
function sentence(item: ActivityFeedEntry): string {
  const name = item.publisherName || i18n.t('activityFeed.deletedCard');
  const month = item.reportMonth ? monthLabel(i18n.language, item.reportMonth) : '';
  switch (item.type) {
    case 'status_change':
      return i18n.t('activityFeed.statusChange', {
        name,
        from: statusLabel(item.oldStatus),
        to: statusLabel(item.newStatus),
      });
    case 'override_applied':
      return i18n.t('activityFeed.overrideApplied', { name, to: statusLabel(item.newStatus) });
    case 'override_cleared':
      return i18n.t('activityFeed.overrideCleared', { name });
    case 'report_submitted':
      return month
        ? i18n.t('activityFeed.reportSubmitted', { name, month })
        : i18n.t('activityFeed.reportUpdatedNoMonth', { name });
    case 'report_updated':
      return month
        ? i18n.t('activityFeed.reportUpdated', { name, month })
        : i18n.t('activityFeed.reportUpdatedNoMonth', { name });
    case 'other':
      return item.targetType === 'publisher'
        ? i18n.t('activityFeed.other', { name })
        : item.summary;
    default:
      return item.summary;
  }
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
        // The seventh door into that screen, and the one missed when the other
        // six learned to say where they came from. Without it the back button
        // falls to «Мои отчёты», which is not where anybody was.
        `/service-reports/publisher-history?publisherId=${item.targetId}&from=${FROM}` as any,
      );
    } else if (item.targetType === 'service_report') {
      router.push(
        // `id`, not `editId` — the SAME typo the publisher history had, and it
        // does the same thing here: the form ignores the unknown parameter and
        // opens a blank one for the reader's own month, a screen away from the
        // report the feed was pointing at.
        `/service-reports/new?id=${item.targetId}&from=${FROM}` as any,
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
        <Text style={styles.summary}>{sentence(item)}</Text>
        <Text style={styles.meta}>
          {formatRelativeTime(item.occurredAt)}
          {item.actorName ? ` · ${item.actorName}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

const FROM = encodeURIComponent('/service-reports/activity');

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
    // The feed is served to admins and elders only. Reaching it without the
    // right — by opening the link directly — should read as a plain sentence,
    // not as the API's own wording.
    const status = (query.error as { response?: { status?: number } })?.response
      ?.status;
    const forbidden = status === 401 || status === 403;
    return (
      <View style={styles.container}>
        <View style={[styles.errorBox, forbidden && styles.noticeBox]}>
          <Text style={[styles.errorText, forbidden && styles.noticeText]}>
            {forbidden
              ? i18n.t('activityFeed.noAccess')
              : extractErrorMessage(query.error)}
          </Text>
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
      style={styles.screen}
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
  container: { flex: 1, padding: 16, backgroundColor: '#f1f5f9' },
  list: { padding: 16, paddingBottom: 32 },
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
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
  noticeBox: { backgroundColor: '#f1f5f9' },
  noticeText: { color: '#475569', lineHeight: 20 },
  errorText: { color: '#991b1b' },
});
