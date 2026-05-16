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
import { router } from 'expo-router';
import {
  extractErrorMessage,
  ServiceReport,
  serviceReportsApi,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import i18n, { formatMonthLabel } from '../../../lib/i18n';

// formatMonth now lives in lib/i18n.ts as formatMonthLabel

function formatActivity(report: ServiceReport): string {
  if (report.hoursReported !== null) {
    return i18n.t('reports.hoursShort', { count: report.hoursReported });
  }
  return report.servedThisMonth ? i18n.t('reports.served') : i18n.t('reports.didNotServe');
}

function formatEditedTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ServiceReportsListScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-reports', 'my'],
    queryFn: () => serviceReportsApi.listMy(),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
        </View>
      </View>
    );
  }

  const reports = (data ?? []).sort(
    (a, b) => b.reportMonth.localeCompare(a.reportMonth),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{t('reports.noReports')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('reports.noReportsHint')}
            </Text>
          </View>
        }
        renderItem={({ item }) => <ReportRow report={item} />}
      />
    </View>
  );
}

function ReportRow({ report }: { report: ServiceReport }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.month}>{formatMonthLabel(report.reportMonth)}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statPrimary}>{formatActivity(report)}</Text>
          {report.bibleStudies > 0 && (
            <Text style={styles.statSecondary}>
              {i18n.t('reports.studies', { count: report.bibleStudies })}
            </Text>
          )}
        </View>
        {report.notes && (
          <Text style={styles.notes} numberOfLines={2}>
            {report.notes}
          </Text>
        )}
        {report.lastEditedAt && (
          <Text style={styles.editInfo}>
            {report.lastEditedByName
              ? i18n.t('reports.editedAtBy', { when: formatEditedTime(report.lastEditedAt), name: report.lastEditedByName })
              : i18n.t('reports.editedAt', { when: formatEditedTime(report.lastEditedAt) })}
          </Text>
        )}
      </View>
      {report.canEdit && (
        <Pressable
          onPress={() =>
            router.push(`/service-reports/new?id=${report.id}` as any)
          }
          style={styles.editBtn}
          hitSlop={8}
        >
          <Ionicons name="pencil" size={20} color="#0ea5e9" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  editBtn: { marginLeft: 12, padding: 8 },
  month: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  statPrimary: { fontSize: 13, color: '#0ea5e9', fontWeight: '600' },
  statSecondary: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  editInfo: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 6,
  },
  notes: { fontSize: 13, color: '#64748b', marginTop: 6, lineHeight: 18 },
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
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
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
