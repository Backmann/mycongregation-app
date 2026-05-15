import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import {
  extractErrorMessage,
  GroupReportRow,
  serviceReportsApi,
} from '../../../lib/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getRecentMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push({
      value: `${yyyy}-${mm}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${yyyy}`,
    });
  }
  return months;
}

export default function GroupReportsScreen() {
  const recentMonths = useMemo(() => getRecentMonths(6), []);
  // Default to the previous completed month (most useful for follow-up).
  const [reportMonth, setReportMonth] = useState(
    recentMonths[Math.min(1, recentMonths.length - 1)].value,
  );

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-reports', 'group', reportMonth],
    queryFn: () => serviceReportsApi.findGroup(reportMonth),
  });

  const aggregate = useMemo(() => {
    if (!data) return { total: 0, submitted: 0, served: 0 };
    let submitted = 0;
    let served = 0;
    for (const row of data.publishers) {
      if (row.report) {
        submitted++;
        const reported =
          row.report.servedThisMonth === true ||
          (row.report.hoursReported !== null && row.report.hoursReported > 0);
        if (reported) served++;
      }
    }
    return { total: data.publishers.length, submitted, served };
  }, [data]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Group reports' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Group reports' }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? 'Not authorized' : 'Could not load'}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Group reports' }} />
      <View style={styles.header}>
        {data?.scopeLabel && (
          <Text style={styles.scopeLabel}>{data.scopeLabel}</Text>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {recentMonths.map((m) => {
            const isActive = reportMonth === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setReportMonth(m.value)}
                style={[styles.monthChip, isActive && styles.monthChipActive]}
              >
                <Text
                  style={[
                    styles.monthChipText,
                    isActive && styles.monthChipTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.statsBar}>
          <View style={styles.statBox}>
            <Text style={styles.statBig}>{aggregate.submitted}</Text>
            <Text style={styles.statLabel}>
              of {aggregate.total} reported
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statBig, styles.statActive]}>
              {aggregate.served}
            </Text>
            <Text style={styles.statLabel}>active</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statBig, styles.statPending]}>
              {aggregate.total - aggregate.submitted}
            </Text>
            <Text style={styles.statLabel}>pending</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={data?.publishers ?? []}
        keyExtractor={(item) => item.publisherId}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No publishers in scope</Text>
          </View>
        }
        renderItem={({ item }) => <PublisherRow row={item} />}
      />
    </View>
  );
}

function PublisherRow({ row }: { row: GroupReportRow }) {
  const { report, displayName, isPioneer } = row;

  const hasActivity =
    !!report &&
    (report.servedThisMonth === true ||
      (report.hoursReported !== null && report.hoursReported > 0));

  const status: 'reported-active' | 'reported-none' | 'pending' = !report
    ? 'pending'
    : hasActivity
      ? 'reported-active'
      : 'reported-none';

  const summary = !report
    ? 'No report yet'
    : isPioneer && report.hoursReported !== null
      ? `${report.hoursReported} hour${report.hoursReported === 1 ? '' : 's'}`
      : report.servedThisMonth === true
        ? 'Served'
        : 'Did not serve';

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.indicator,
          status === 'reported-active' && styles.indicatorActive,
          status === 'reported-none' && styles.indicatorNone,
          status === 'pending' && styles.indicatorPending,
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>
          {displayName}
          {isPioneer && <Text style={styles.pioneerTag}> · pioneer</Text>}
        </Text>
        <Text style={styles.activity}>
          {summary}
          {report && report.bibleStudies > 0 && (
            <Text style={styles.studies}>
              {' · '}
              {report.bibleStudies}{' '}
              {report.bibleStudies === 1 ? 'study' : 'studies'}
            </Text>
          )}
        </Text>
      </View>
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
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  scopeLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthRow: { paddingHorizontal: 16, gap: 8 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  monthChipText: { fontSize: 13, color: '#0f172a' },
  monthChipTextActive: { color: '#fff', fontWeight: '600' },
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statBig: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  statActive: { color: '#10b981' },
  statPending: { color: '#dc2626' },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 14,
    borderWidth: 2,
  },
  indicatorActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  indicatorNone: { backgroundColor: '#94a3b8', borderColor: '#94a3b8' },
  indicatorPending: {
    backgroundColor: 'transparent',
    borderColor: '#cbd5e1',
  },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  pioneerTag: { fontSize: 12, color: '#0ea5e9', fontWeight: '500' },
  activity: { fontSize: 13, color: '#64748b', marginTop: 2 },
  studies: { fontSize: 13, color: '#64748b' },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
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
