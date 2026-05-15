import { useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import {
  extractErrorMessage,
  PublisherHistoryEntry,
  PublisherStatus,
  serviceReportsApi,
} from '../../../lib/api';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatMonthLabel(reportMonth: string): string {
  const [yyyy, mm] = reportMonth.split('-');
  const monthIdx = parseInt(mm, 10) - 1;
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return reportMonth;
  }
  return `${MONTH_NAMES[monthIdx]} ${yyyy}`;
}

function describeReport(report: NonNullable<PublisherHistoryEntry['report']>): {
  summary: string;
  served: boolean;
} {
  const served =
    report.servedThisMonth === true ||
    (report.hoursReported !== null && report.hoursReported > 0);

  if (!served && report.servedThisMonth === false) {
    return { summary: 'Did not serve', served: false };
  }
  if (report.hoursReported !== null && report.hoursReported > 0) {
    return {
      summary: `${report.hoursReported} hour${
        report.hoursReported === 1 ? '' : 's'
      }`,
      served: true,
    };
  }
  if (report.servedThisMonth === true) {
    return { summary: 'Served', served: true };
  }
  return { summary: '—', served: false };
}

function StatusBadge({
  status,
  isOverridden,
}: {
  status: PublisherStatus;
  isOverridden: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        status === 'active' && styles.badgeActive,
        status === 'irregular' && styles.badgeIrregular,
        status === 'inactive' && styles.badgeInactive,
      ]}
    >
      <Text style={styles.badgeText}>{status}</Text>
      {isOverridden && (
        <Ionicons
          name="lock-closed"
          size={10}
          color="#fff"
          style={{ marginLeft: 4 }}
        />
      )}
    </View>
  );
}

function TimelineEntryCard({
  entry,
  onPress,
}: {
  entry: PublisherHistoryEntry;
  onPress?: () => void;
}) {
  const monthLabel = formatMonthLabel(entry.reportMonth);

  if (!entry.report) {
    return (
      <View style={[styles.card, styles.cardEmpty]}>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <View style={styles.row}>
          <View style={[styles.dot, styles.dotPending]} />
          <Text style={styles.emptyText}>Not submitted</Text>
        </View>
      </View>
    );
  }

  const { summary, served } = describeReport(entry.report);
  const submittedByName =
    entry.report.submittedOnBehalfOf ?? '(self)';
  const editLabel =
    entry.report.lastEditedAt && entry.report.lastEditedByName
      ? `edited by ${entry.report.lastEditedByName}`
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={styles.card}
      android_ripple={{ color: '#e2e8f0' }}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        {entry.report.canEdit && (
          <Ionicons name="pencil-outline" size={14} color="#94a3b8" />
        )}
      </View>
      <View style={styles.row}>
        <View
          style={[
            styles.dot,
            served ? styles.dotActive : styles.dotInactive,
          ]}
        />
        <Text style={styles.summary}>
          {summary}
          {entry.report.bibleStudies > 0 && (
            <Text style={styles.studies}>
              {' · '}
              {entry.report.bibleStudies}{' '}
              {entry.report.bibleStudies === 1 ? 'study' : 'studies'}
            </Text>
          )}
        </Text>
      </View>
      {entry.report.notes && (
        <Text style={styles.notes} numberOfLines={2}>
          “{entry.report.notes}”
        </Text>
      )}
      <Text style={styles.meta}>
        Submitted by {submittedByName}
        {editLabel && <Text style={styles.metaEdited}>{' · ' + editLabel}</Text>}
      </Text>
    </Pressable>
  );
}

export default function PublisherHistoryScreen() {
  const params = useLocalSearchParams<{
    publisherId?: string;
    displayName?: string;
  }>();
  const publisherId =
    typeof params.publisherId === 'string' ? params.publisherId : undefined;
  const initialDisplayName =
    typeof params.displayName === 'string' ? params.displayName : '';

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['publisher-history', publisherId],
    queryFn: () => serviceReportsApi.getHistoryForPublisher(publisherId!, 12),
    enabled: !!publisherId,
  });

  const headerTitle = useMemo(
    () => data?.publisher.displayName ?? initialDisplayName ?? 'Publisher',
    [data, initialDisplayName],
  );

  if (!publisherId) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Publisher history' }} />
        <Text style={styles.errorText}>No publisher id supplied.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Publisher history' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Publisher history' }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? 'Not authorized' : 'Could not load history'}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Publisher history' }} />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerName} numberOfLines={1}>
            {headerTitle}
            {data?.publisher.isPioneer && (
              <Text style={styles.pioneerTag}> · pioneer</Text>
            )}
          </Text>
          {data && (
            <StatusBadge
              status={data.publisher.status}
              isOverridden={data.publisher.statusManuallyOverridden}
            />
          )}
        </View>
        <Text style={styles.headerSub}>Last 12 months</Text>
      </View>

      <FlatList
        data={data?.timeline ?? []}
        keyExtractor={(item) => item.reportMonth}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyStateTitle}>No history</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TimelineEntryCard
            entry={item}
            onPress={
              item.report
                ? () =>
                    router.push(
                      `/service-reports/new?editId=${item.report!.id}` as any,
                    )
                : undefined
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 1,
  },
  pioneerTag: { fontSize: 13, color: '#0ea5e9', fontWeight: '500' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  badgeActive: { backgroundColor: '#10b981' },
  badgeIrregular: { backgroundColor: '#f59e0b' },
  badgeInactive: { backgroundColor: '#94a3b8' },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardEmpty: { borderStyle: 'dashed', backgroundColor: '#f8fafc' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  monthLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: '#10b981' },
  dotInactive: { backgroundColor: '#94a3b8' },
  dotPending: { backgroundColor: '#cbd5e1' },
  summary: { fontSize: 14, color: '#0f172a' },
  studies: { fontSize: 14, color: '#64748b' },
  emptyText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  notes: {
    fontSize: 13,
    color: '#475569',
    marginTop: 6,
    fontStyle: 'italic',
  },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 6 },
  metaEdited: { color: '#0ea5e9' },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
