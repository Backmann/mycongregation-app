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
import { useTranslation } from 'react-i18next';
import i18n, { formatMonthLabel } from '../../../lib/i18n';

// formatMonthLabel now imported from lib/i18n

function describeReport(report: NonNullable<PublisherHistoryEntry['report']>): {
  summary: string;
  served: boolean;
} {
  const served =
    report.servedThisMonth === true ||
    (report.hoursReported !== null && report.hoursReported > 0);

  if (!served && report.servedThisMonth === false) {
    return { summary: i18n.t('reports.didNotServe'), served: false };
  }
  if (report.hoursReported !== null && report.hoursReported > 0) {
    return {
      summary: i18n.t('reports.hoursLong', { count: report.hoursReported }),
      served: true,
    };
  }
  if (report.servedThisMonth === true) {
    return { summary: i18n.t('reports.served'), served: true };
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
      <Text style={styles.badgeText}>{i18n.t(`publishers.status.${status}`)}</Text>
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
          <Text style={styles.emptyText}>{i18n.t('reports.publisherHistory.notSubmitted')}</Text>
        </View>
      </View>
    );
  }

  const { summary, served } = describeReport(entry.report);
  const submittedByName =
    entry.report.submittedOnBehalfOf ?? i18n.t('reports.publisherHistory.self');
  const editLabel =
    entry.report.lastEditedAt && entry.report.lastEditedByName
      ? i18n.t('reports.publisherHistory.editedBy', { name: entry.report.lastEditedByName })
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
              {i18n.t('reports.studies', { count: entry.report.bibleStudies })}
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
        {i18n.t('reports.publisherHistory.submittedBy', { name: submittedByName })}
        {editLabel && <Text style={styles.metaEdited}>{' · ' + editLabel}</Text>}
      </Text>
    </Pressable>
  );
}

export default function PublisherHistoryScreen() {
  const { t } = useTranslation();
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
    () => data?.publisher.displayName ?? initialDisplayName ?? t('reports.publisherHistory.fallbackName'),
    [data, initialDisplayName, t],
  );

  if (!publisherId) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.publisherHistory') }} />
        <Text style={styles.errorText}>{t('reports.publisherHistory.noPublisherId')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.publisherHistory') }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.publisherHistory') }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? t('audit.notAuthorized') : t('audit.couldNotLoadHistory')}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('reports.title.publisherHistory') }} />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerName} numberOfLines={1}>
            {headerTitle}
            {data?.publisher.isPioneer && (
              <Text style={styles.pioneerTag}>{t('reports.pioneerInline')}</Text>
            )}
          </Text>
          {data && (
            <StatusBadge
              status={data.publisher.status}
              isOverridden={data.publisher.statusManuallyOverridden}
            />
          )}
        </View>
        <Text style={styles.headerSub}>{t('reports.publisherHistory.last12Months')}</Text>
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
            <Text style={styles.emptyStateTitle}>{t('reports.publisherHistory.noHistory')}</Text>
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
