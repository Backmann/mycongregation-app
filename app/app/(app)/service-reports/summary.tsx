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
  attendanceApi,
  meetingSettingsApi,
  serviceReportsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useTranslation } from 'react-i18next';
import { formatMonthLabel } from '../../../lib/i18n';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { buildMonthlyReportPdfHtml } from '../../../lib/monthlyReportPdf';
import { HEADER_ICON } from '../../../lib/header';



/** Short axis label like "сен 25" for the year trend. */


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

  const overview = useQuery({
    queryKey: ['meeting-settings', 'overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 10 * 60 * 1000,
  });

  // The S-3 figures for the year this month belongs to; the month's own two
  // averages are read out of it below.
  const attendanceYear = useQuery({
    queryKey: ['attendance', 'year', reportMonth.slice(0, 7)],
    queryFn: () => {
      const [y, m] = reportMonth.slice(0, 7).split('-').map(Number);
      return attendanceApi.serviceYear(m >= 9 ? y : y - 1);
    },
    enabled: canViewServiceSummary,
  });
  const monthAttendance = useMemo(
    () =>
      (attendanceYear.data?.months ?? []).find(
        (m) => m.month.slice(0, 7) === reportMonth.slice(0, 7),
      ) ?? null,
    [attendanceYear.data, reportMonth],
  );

  // Who has NOT handed a report in — the reason to print on the 15th rather
  // than the 20th: there is still time to ask them.
  const groupRows = useQuery({
    queryKey: ['group-reports', reportMonth],
    queryFn: () => serviceReportsApi.findGroup(reportMonth),
    enabled: canViewServiceSummary,
  });

  const print = () => {
    if (!data) return;
    const preopened = openPrintWindow();
    const html = buildMonthlyReportPdfHtml({
      summary: data,
      attendance: {
        weekend: monthAttendance?.weekendAverage ?? null,
        midweek: monthAttendance?.midweekAverage ?? null,
      },
      missing: (groupRows.data?.publishers ?? [])
        .filter((p) => !p.report)
        .map((p) => p.displayName),
      congregationName: overview.data?.congregation?.name ?? '',
      monthLabel: formatMonthLabel(reportMonth),
      printedOn: new Date().toLocaleDateString(i18nInstance.language, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      labels: {
        title: t('serviceSummary.printTitle'),
        allActive: t('serviceSummary.allActive'),
        weekendAverage: t('serviceSummary.weekendAverage'),
        midweekAverage: t('serviceSummary.midweekAverage'),
        notForForm: t('serviceSummary.notForForm'),
        categories: {
          none: t('serviceSummary.categories.none'),
          auxiliary: t('serviceSummary.categories.auxiliary'),
          regular: t('serviceSummary.categories.regular'),
          special: t('serviceSummary.categories.special'),
          missionary: t('serviceSummary.categories.missionary'),
        },
        count: t('serviceSummary.count'),
        hours: t('serviceSummary.hours'),
        studies: t('serviceSummary.studies'),
        missingTitle: t('serviceSummary.missingTitle'),
        printed: t('serviceSummary.printedOn'),
        draftNote: t('serviceSummary.printDraftNote'),
      },
    });
    void exportHtmlAsPdf(html, {
      fileName: 'S-1',
      preopenedWindow: preopened,
    });
  };

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
      <Stack.Screen
        options={{
          title: t('reports.summary.title'),
          headerRight: () => (
            <Pressable onPress={print} style={{ paddingHorizontal: 8 }} hitSlop={8}>
              <Ionicons name="print-outline" size={22} color={HEADER_ICON} />
            </Pressable>
          ),
        }}
      />
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

        {/* Two averages, from the S-3 sheet, where the secretary copies them.
            The monthly form asks only for the WEEKEND one; the midweek is
            wanted a year later, on S-10. Both are shown, each said plainly to
            belong where it belongs — the alternative is two screens for one
            form, which is how a figure gets copied from the wrong line.

            What stood here before — averages per pioneer, percentages, the
            year-to-date total and a trend chart — goes into no form at all.
            «65% сдали отчёт» on the 4th read as alarm, and the year total
            repeated the annual report in a different wording of the year. */}
        <View style={[styles.card, styles.totalsCard]}>
          <Text style={styles.cardTitle}>
            {t('serviceSummary.attendanceTitle')}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statActive]}>
                {monthAttendance?.weekendAverage ?? '—'}
              </Text>
              <Text style={styles.statLabel}>
                {t('serviceSummary.weekendAverage')}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBig}>
                {monthAttendance?.midweekAverage ?? '—'}
              </Text>
              <Text style={styles.statLabel}>
                {t('serviceSummary.midweekAverage')}
              </Text>
            </View>
          </View>
          <Text style={styles.totalsHint}>
            {t('serviceSummary.attendanceHint')}
          </Text>
        </View>

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
