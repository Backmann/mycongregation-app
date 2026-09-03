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
import { pioneerProgress } from '../../../lib/pioneer-goal';
import { isActivePermanentPioneer } from '../../../lib/pioneer-status';
import {
  HistoryTrendChart,
  TrendPoint,
} from '../../../components/HistoryTrendChart';

// formatMonthLabel now imported from lib/i18n

/** Short axis label like "июн 26" for the trend chart. */
function shortMonthLabel(reportMonth: string): string {
  const full = formatMonthLabel(reportMonth); // "Июнь 2026"
  const parts = full.split(' ');
  const mon = parts[0]?.slice(0, 3).toLowerCase() ?? '';
  const yr = parts[1]?.slice(2) ?? '';
  return `${mon} ${yr}`;
}

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
  status: PublisherStatus | null;
  isOverridden: boolean;
}) {
  if (!status) return null;
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
  // WHO handed it in. `submittedOnBehalfOf` is a yes/no — was this entered by
  // somebody else — and it was being printed straight into a line that asks
  // for a name, so the card read «Подал: true». The name lives in its own
  // field; when the publisher entered it himself there is none, and the line
  // says so.
  const submittedByName = entry.report.submittedOnBehalfOf
    ? (entry.report.submittedByName ??
      i18n.t('reports.publisherHistory.someoneElse'))
    : i18n.t('reports.publisherHistory.self');
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
    queryFn: () => serviceReportsApi.getHistoryForPublisher(publisherId!, 120),
    enabled: !!publisherId,
  });

  // Trend points, oldest → newest (timeline is newest-first). Only months that
  // have a report contribute; empty months are skipped so the trend isn't all
  // zeros for irregular publishers.
  const trendPoints = useMemo<TrendPoint[]>(() => {
    const tl = data?.timeline ?? [];
    const withReports = tl.filter((e) => e.report != null);
    return withReports
      .slice()
      .reverse()
      .map((e) => ({
        monthLabel: shortMonthLabel(e.reportMonth),
        hours: e.report!.hoursReported,
        studies: e.report!.bibleStudies,
      }));
  }, [data]);

  const headerTitle = useMemo(
    () => data?.publisher.displayName ?? initialDisplayName ?? t('reports.publisherHistory.fallbackName'),
    [data, initialDisplayName, t],
  );

  const progress = useMemo(() => {
    const p = data?.publisher;
    if (!p || !isActivePermanentPioneer(p.pioneerType, p.pioneerSince))
      return null;
    return pioneerProgress(p.pioneerType, p.pioneerSince, data.timeline);
  }, [data]);

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
      <Stack.Screen
        options={{ title: t('reports.title.publisherHistory') }}
      />
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
        ListHeaderComponent={
          <View>
            {progress && (
              <View style={styles.goalCard}>
                <View style={styles.goalRow}>
                  <Text style={styles.goalLabel}>
                    {t('reports.pioneerGoal.title')}
                  </Text>
                  <Text
                    style={[
                      styles.goalPace,
                      progress.onTrack ? styles.goalOk : styles.goalBehind,
                    ]}
                  >
                    {progress.onTrack
                      ? t('reports.pioneerGoal.onTrack')
                      : t('reports.pioneerGoal.behind')}
                  </Text>
                </View>
                <View style={styles.goalBarTrack}>
                  <View
                    style={[
                      styles.goalBarFill,
                      progress.onTrack
                        ? styles.goalBarOk
                        : styles.goalBarBehind,
                      {
                        width: `${Math.min(
                          100,
                          progress.annualGoal > 0
                            ? (progress.hours / progress.annualGoal) * 100
                            : 0,
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.goalDetail}>
                  {t('reports.pioneerGoal.detail', {
                    hours: progress.hours,
                    goalToDate: progress.goalToDate,
                    annualGoal: progress.annualGoal,
                  })}
                </Text>
              </View>
            )}
            {trendPoints.length >= 2 ? (
              <View style={{ marginBottom: 6 }}>
                <HistoryTrendChart points={trendPoints} />
              </View>
            ) : null}
          </View>
        }
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
  goalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  goalPace: { fontSize: 12, fontWeight: '600' },
  goalOk: { color: '#0f766e' },
  goalBehind: { color: '#b45309' },
  goalBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  goalBarFill: { height: 8, borderRadius: 4 },
  goalBarOk: { backgroundColor: '#0ea5e9' },
  goalBarBehind: { backgroundColor: '#f59e0b' },
  goalDetail: { fontSize: 12, color: '#64748b', marginTop: 6 },
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    flexShrink: 1,
  },
  pioneerTag: { fontSize: 13, color: '#0ea5e9', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
  monthLabel: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
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
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
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
