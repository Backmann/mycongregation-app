import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import {
  extractErrorMessage,
  serviceReportsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useTranslation } from 'react-i18next';
import { formatMonthLabel } from '../../../lib/i18n';
import {
  HistoryTrendChart,
  TrendPoint,
} from '../../../components/HistoryTrendChart';



/** Short axis label like "сен 25" for the year trend. */
function shortMonthLabel(reportMonth: string): string {
  const full = formatMonthLabel(reportMonth);
  const parts = full.split(' ');
  const mon = parts[0]?.slice(0, 3).toLowerCase() ?? '';
  const yr = parts[1]?.slice(2) ?? '';
  return `${mon} ${yr}`;
}



function getRecentMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  // Start from last month: the current month has not finished, so its summary
  // would be incomplete and it cannot be closed yet.
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push({
      value: `${yyyy}-${mm}`,
      label: formatMonthLabel(`${yyyy}-${mm}`),
    });
  }
  return months;
}

export default function ServiceSummaryScreen() {
  const { t, i18n: i18nInstance } = useTranslation();
  const { canViewServiceSummary } = usePermissions();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentMonths = useMemo(() => getRecentMonths(6), [i18nInstance.language]);
  // Default to the previous completed month — the one the secretary compiles.
  const [reportMonth, setReportMonth] = useState(
    recentMonths[0].value,
  );

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-reports', 'summary', reportMonth],
    queryFn: () => serviceReportsApi.getSummary(reportMonth),
    enabled: canViewServiceSummary,
  });

  // The service year of the month ON SCREEN, not of today.
  //
  // It used to ask for «the current service year», so on 4 September — three
  // days into a new one — the page showed August 2026 above a total of zero
  // hours for September 2026 – August 2027, and a trend chart of twelve empty
  // columns. August belongs to the year BEFORE. The year the reader is looking
  // at is the year he is looking at.
  //
  // The server labels a service year by the year it ENDS in, so August 2026
  // asks for 2026 and September 2026 asks for 2027.
  const selectedServiceYear = useMemo(() => {
    const [y, m] = reportMonth.slice(0, 7).split('-').map(Number);
    return m >= 9 ? y + 1 : y;
  }, [reportMonth]);

  const yearQuery = useQuery({
    queryKey: ['service-reports', 'year-summary', selectedServiceYear],
    queryFn: () => serviceReportsApi.getYearSummary(selectedServiceYear),
    enabled: canViewServiceSummary,
  });

  const yearTrendPoints = useMemo<TrendPoint[]>(() => {
    const monthly = yearQuery.data?.monthly ?? [];
    const points = monthly.map((m) => ({
      monthLabel: shortMonthLabel(m.reportMonth),
      hours: m.hours,
      studies: m.studies,
    }));
    // A year with nothing in it yet drew twelve empty columns down a quarter of
    // the screen and said nothing at all. A chart with no data is not a chart.
    return points.some((p) => p.hours > 0 || p.studies > 0) ? points : [];
  }, [yearQuery.data]);

  const queryClient = useQueryClient();
  const closureMutation = useMutation({
    mutationFn: (action: 'close' | 'reopen') =>
      action === 'close'
        ? serviceReportsApi.closeMonth(reportMonth)
        : serviceReportsApi.reopenMonth(reportMonth),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['service-reports', 'summary', reportMonth],
      });
      queryClient.invalidateQueries({
        queryKey: ['service-reports', 'group', reportMonth],
      });
    },
  });

  if (!canViewServiceSummary) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.summary.title') }} />
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.errorTitle}>{t('serviceSummary.noAccessTitle')}</Text>
        <Text style={styles.errorText}>
          {t('serviceSummary.noAccessBody')}
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.summary.title') }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.summary.title') }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden
            ? t('serviceSummary.noAccessTitle')
            : t('serviceSummary.loadFailed')}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('reports.summary.title') }} />
      <View style={styles.header}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <View
          style={[
            styles.card,
            data?.closed ? styles.closedCard : styles.openCard,
          ]}
        >
          <View style={styles.closureRow}>
            <Ionicons
              name={data?.closed ? 'lock-closed' : 'lock-open-outline'}
              size={20}
              color={data?.closed ? '#b45309' : '#0ea5e9'}
            />
            <Text style={styles.closureTitle}>
              {data?.closed
                ? t('reports.summary.monthClosed')
                : t('reports.summary.monthOpen')}
            </Text>
          </View>
          <Text style={styles.closureHint}>
            {data?.closed
              ? t('reports.summary.closedHint')
              : t('reports.summary.openHint')}
          </Text>
          {/* Closing settles the statuses too, and does it at once. Said
              before the click, not discovered after it. */}
          {!data?.closed ? (
            <Text style={styles.closureHint}>
              {t('reports.summary.closureAffectsStatus')}
            </Text>
          ) : null}
          <Pressable
            onPress={() =>
              closureMutation.mutate(data?.closed ? 'reopen' : 'close')
            }
            disabled={closureMutation.isPending}
            style={[
              styles.closureBtn,
              data?.closed ? styles.reopenBtn : styles.closeBtn,
              closureMutation.isPending && styles.btnDisabled,
            ]}
          >
            <Text style={styles.closureBtnText}>
              {closureMutation.isPending
                ? t('common.saving')
                : data?.closed
                  ? t('reports.summary.reopenMonth')
                  : t('reports.summary.closeMonth')}
            </Text>
          </Pressable>
          {closureMutation.isError && (
            <Text style={styles.closureError}>
              {extractErrorMessage(closureMutation.error)}
            </Text>
          )}
        </View>

        {data?.categories.map((cat) => (
          <View key={cat.pioneerType} style={styles.card}>
            <Text style={styles.cardTitle}>
              {t(`serviceSummary.categories.${cat.pioneerType}`, {
                defaultValue: cat.pioneerType,
              })}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{cat.count}</Text>
                <Text style={styles.statLabel}>{t('serviceSummary.count')}</Text>
              </View>
              {cat.hours !== null && (
                <View style={styles.statBox}>
                  <Text style={styles.statBig}>{cat.hours}</Text>
                  <Text style={styles.statLabel}>{t('serviceSummary.hours')}</Text>
                </View>
              )}
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{cat.bibleStudies}</Text>
                <Text style={styles.statLabel}>{t('serviceSummary.studies')}</Text>
              </View>
            </View>
          </View>
        ))}

        <View style={[styles.card, styles.totalsCard]}>
          <Text style={styles.cardTitle}>{t('serviceSummary.sizeTitle')}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statActive]}>
                {data?.totalActivePublishers ?? 0}
              </Text>
              <Text style={styles.statLabel}>{t('serviceSummary.allActive')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statInactive]}>
                {data?.totalInactivePublishers ?? 0}
              </Text>
              <Text style={styles.statLabel}>{t('serviceSummary.inactive')}</Text>
            </View>
          </View>
          <Text style={styles.totalsHint}>{t('serviceSummary.sizeHint')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('serviceSummary.averagesTitle')}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statBig}>
                {data?.averages.pioneerHours ?? 0}
              </Text>
              <Text style={styles.statLabel}>{t('serviceSummary.hoursPioneers')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBig}>
                {data?.averages.bibleStudies ?? 0}
              </Text>
              <Text style={styles.statLabel}>{t('serviceSummary.studies')}</Text>
            </View>
          </View>
          <View style={[styles.statsRow, { marginTop: 12 }]}>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statActive]}>
                {data?.averages.submittedPct ?? 0}%
              </Text>
              <Text style={styles.statLabel}>{t('serviceSummary.reported')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statActive]}>
                {data?.averages.activePct ?? 0}%
              </Text>
              <Text style={styles.statLabel}>{t('serviceSummary.activeCount')}</Text>
            </View>
          </View>
          <Text style={styles.totalsHint}>
            {t('serviceSummary.averagesHint')}
          </Text>
          {/* «65% сдали отчёт» on the 4th is arithmetic, not alarm: the month
              is open and the rest are simply not late yet. Said here so the
              figure is not read as a congregation falling behind. */}
          {!data?.closed ? (
            <Text style={styles.totalsHint}>
              {t('serviceSummary.stillCollecting')}
            </Text>
          ) : null}
        </View>

        {yearQuery.data ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {/* Written as the form writes it — «2025/2026». The server
                  names a year by the one it ends in, the annual report names it
                  by the one it starts in, and a secretary reading both screens
                  should not have to work out that «2027» and «2026/2027» are
                  the same twelve months. */}
              {t('serviceSummary.yearTotalTitle', {
                from: yearQuery.data.serviceYear - 1,
                to: yearQuery.data.serviceYear,
              })}
            </Text>
            <Text style={styles.yearRange}>
              {formatMonthLabel(yearQuery.data.firstMonth)} —{' '}
              {formatMonthLabel(yearQuery.data.lastMonth)}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{yearQuery.data.totalHours}</Text>
                <Text style={styles.statLabel}>{t('serviceSummary.totalHours')}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>
                  {yearQuery.data.totalStudies}
                </Text>
                <Text style={styles.statLabel}>{t('serviceSummary.totalStudies')}</Text>
              </View>
            </View>
            {yearTrendPoints.length >= 2 ? (
              <View style={{ marginTop: 14 }}>
                <HistoryTrendChart points={yearTrendPoints} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  yearRange: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
    marginTop: -4,
  },
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
  monthChipTextActive: { color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  scrollBody: { padding: 16, paddingBottom: 32, gap: 12 },
  closedCard: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  openCard: { borderColor: '#bae6fd', backgroundColor: '#f0f9ff' },
  closureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closureTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  closureHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 17,
  },
  closureBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtn: { backgroundColor: '#b45309' },
  reopenBtn: { backgroundColor: '#0ea5e9' },
  btnDisabled: { opacity: 0.6 },
  closureBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  closureError: { color: '#dc2626', fontSize: 13, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalsCard: { marginTop: 4 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statBig: { fontSize: 22, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  statActive: { color: '#10b981' },
  statInactive: { color: '#94a3b8' },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  totalsHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 12,
    lineHeight: 17,
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
