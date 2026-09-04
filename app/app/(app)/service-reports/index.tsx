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
import { usePermissions } from '../../../lib/permissions';

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

/**
 * The way into the section, and the one card most of the congregation needs.
 *
 * Eighty-eight people come here to hand in one report. They used to meet a
 * list of their own past months and a row of SIX unlabelled icons in the
 * header — two of which were people, and people-in-a-circle. Everything the
 * elders reach for is now a named line on the page, in plain words, shown only
 * to those it belongs to; the header keeps the plus and nothing else.
 *
 * Above all of it stands this month: whether it is handed in, and how long
 * there is. The line CALLS rather than permits — «месяц закончился, можно
 * сдавать», then a count of days, and only at the end the date itself. Said
 * the other way round, a deadline three weeks off reads as permission to
 * forget.
 */
function MonthCard() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['my-report-standing'],
    queryFn: () => serviceReportsApi.myStanding(),
  });
  if (!data?.applicable || !data.reportMonth) return null;

  const days = data.daysLeft;
  const closed = days !== null && days < 0;
  const monthLabel = formatMonthLabel(data.reportMonth);
  const closesLabel = data.closesOn
    ? new Date(`${data.closesOn}T12:00:00`).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'long',
      })
    : '';

  const call = data.submitted
    ? closed
      ? t('reports.entry.doneClosed')
      : t('reports.entry.doneEditable', { date: closesLabel })
    : closed
      ? t('reports.entry.missed')
      : days !== null && days <= 4
        ? t('reports.entry.lastDays', { date: closesLabel })
        : days !== null && days <= 11
          ? t('reports.entry.daysLeft', { count: days })
          : t('reports.entry.open');

  return (
    <View style={[styles.monthCard, data.submitted && styles.monthCardDone]}>
      <Text style={styles.monthKicker}>{t('reports.entry.myReport')}</Text>
      <Text style={styles.monthBig}>{monthLabel}</Text>
      <Text
        style={[
          styles.monthCall,
          !data.submitted && !closed && days !== null && days <= 4
            ? styles.monthCallUrgent
            : null,
        ]}
      >
        {call}
      </Text>
      {!closed ? (
        <Pressable
          style={styles.monthBtn}
          onPress={() =>
            router.push(
              data.submitted && data.reportId
                ? (`/service-reports/new?id=${data.reportId}` as any)
                : ('/service-reports/new' as any),
            )
          }
        >
          <Text style={styles.monthBtnText}>
            {data.submitted
              ? t('reports.entry.change')
              : t('reports.entry.submit')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SectionRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** What the section would tell you if you opened it. */
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.sectionRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color="#0e7490" />
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {value ? <Text style={styles.sectionValue}>{value}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

export default function ServiceReportsListScreen() {
  const { t } = useTranslation();
  const { canViewServiceSummary, isAdmin, isElder } = usePermissions();
  const now = new Date();
  const serviceYearNow =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const canViewActivityFeed = isAdmin || isElder;
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-reports', 'my'],
    queryFn: () => serviceReportsApi.listMy(),
  });
  // A section line that says its own number answers the question before it is
  // opened, and half the visits here stop being necessary. Only ONE extra
  // request, and one the app already makes elsewhere: «сдали столько-то из
  // стольких-то» is precisely what the collection card holds. The other
  // sections stay unlabelled rather than cost four more round trips on a phone
  // in a Kingdom Hall with poor signal.
  const collection = useQuery({
    queryKey: ['report-collection'],
    queryFn: () => serviceReportsApi.getCollection(),
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
        ListHeaderComponent={
          <View>
            <MonthCard />
            <SectionRow
              icon="people-outline"
              label={t('reports.title.group')}
              value={
                collection.data
                  ? t('reports.entry.collected', {
                      received: collection.data.received,
                      expected: collection.data.expected,
                      month: formatMonthLabel(collection.data.reportMonth),
                    })
                  : undefined
              }
              onPress={() =>
                router.push('/service-reports/group' as any)
              }
            />
            <SectionRow
              icon="people-circle-outline"
              label={t('attendance.pageTitle')}
              onPress={() =>
                router.push('/service-reports/attendance' as any)
              }
            />
            {canViewServiceSummary ? (
              <>
                <SectionRow
                  icon="stats-chart-outline"
                  label={t('reports.summary.title')}
                  onPress={() =>
                    router.push('/service-reports/summary' as any)
                  }
                />
                <SectionRow
                  icon="clipboard-outline"
                  label={t('annualReport.pageTitle')}
                  // No request for this one: which service year we are in is
                  // arithmetic, and September starts the next.
                  value={t('reports.entry.serviceYear', {
                    from: serviceYearNow,
                    to: serviceYearNow + 1,
                  })}
                  onPress={() =>
                    router.push('/service-reports/annual' as any)
                  }
                />
              </>
            ) : null}
            {canViewActivityFeed ? (
              <SectionRow
                icon="pulse-outline"
                label={t('reports.title.activity')}
                onPress={() =>
                  router.push('/service-reports/activity' as any)
                }
              />
            ) : null}
            <Text style={styles.listHeading}>{t('reports.entry.myMonths')}</Text>
          </View>
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
  monthCard: {
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthCardDone: { borderColor: '#bbf7d0', backgroundColor: '#f7fefa' },
  monthKicker: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  monthBig: {
    fontSize: 20,
    marginTop: 2,
    color: '#0f172a',
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
  },
  monthCall: { fontSize: 13.5, color: '#475569', marginTop: 4, lineHeight: 19 },
  monthCallUrgent: { color: '#b45309', fontWeight: '700' },
  monthBtn: {
    marginTop: 12,
    backgroundColor: '#0e7490',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  monthBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionValue: { fontSize: 12.5, color: '#64748b', marginTop: 1 },
  sectionLabel: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  listHeading: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
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
  month: { fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  statPrimary: { fontSize: 13, color: '#0ea5e9', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  statSecondary: { fontSize: 13, color: '#64748b', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
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
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
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
