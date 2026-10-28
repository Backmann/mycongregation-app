import { useLayoutEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { HEADER_ICON } from '../../../lib/header';
import {
  BRAND,
  Chip,
  INK,
  LINE,
  MUTED,
  MonthPlaque,
  PioneerYear,
  Tile,
  cardStyles,
} from '../../../components/reports/ReportBits';
import {
  extractErrorMessage,
  MyReportStanding,
  ServiceReport,
  serviceGroupsApi,
  serviceReportsApi,
} from '../../../lib/api';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { useTranslation } from 'react-i18next';
import i18n, { formatMonthLabel } from '../../../lib/i18n';
import { usePermissions } from '../../../lib/permissions';
import { useMayOpen } from '../../../lib/useMayOpen';
import { failsScreen } from '../../../lib/screen-failure';

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
    hour: '2-digit', hour12: false,
    minute: '2-digit',
  });
}

/**
 * The way into the section, and the one card most of the congregation needs.
 *
 * Eighty-eight people come here to hand in one report. Above everything
 * stands this month (rebuilt 28 October 2026 in the look of the publisher's
 * card): a month plaque, its state as a chip, and ONE action — «Сдать отчёт»
 * while it is due, a quiet «Исправить» while he may still correct it, and
 * plain words when he no longer may. The line CALLS rather than permits:
 * a deadline three weeks off said as a date reads as permission to forget.
 */
function MonthCard({ standing }: { standing: MyReportStanding | undefined }) {
  const { t } = useTranslation();
  const data = standing;
  if (!data?.applicable || !data.reportMonth) return null;

  const days = data.daysLeft;
  // Two different ends (28 September): the last day to CORRECT a filed
  // report is `closesOn`; a missing one is still taken after it, until the
  // secretary closes the month.
  const pastDeadline = days !== null && days < 0;
  const closed = data.closed === true;
  const closesLabel = data.closesOn
    ? new Date(`${data.closesOn}T12:00:00`).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'long',
      })
    : '';
  const monthName = new Date(`${data.reportMonth.slice(0, 7)}-01T12:00:00`)
    .toLocaleDateString(i18n.language, { month: 'long' });
  const mine = data.report ?? null;
  const canEdit = mine ? mine.canEdit : !pastDeadline && !closed;

  const due = !data.submitted;
  const call = data.submitted
    ? null
    : closed
      ? t('reports.entry.missed')
      : pastDeadline
        ? t('reports.entry.late', { date: closesLabel })
        : days !== null && days <= 4
          ? t('reports.entry.lastDays', { date: closesLabel })
          : days !== null && days <= 11
            ? t('reports.entry.daysLeft', { count: days })
            : t('reports.entry.open');

  return (
    <View style={[cardStyles.card, due ? cardStyles.due : cardStyles.done]}>
      <View style={styles.heroTop}>
        <MonthPlaque month={data.reportMonth} tone={due ? 'due' : 'done'} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.kicker}>{t('reports.entry.myReport')}</Text>
          <Text style={styles.heroTitle}>{capitalise(monthName)}</Text>
          <View style={styles.chips}>
            {due ? (
              <>
                <Chip tone="amber" text={t('reports.hero.notIn')} />
                {data.closesOn && !pastDeadline && !closed ? (
                  <Chip
                    tone="grey"
                    text={t('reports.hero.until', { date: closesLabel, count: Math.max(0, days ?? 0) })}
                  />
                ) : null}
              </>
            ) : (
              <Chip
                tone="green"
                text={
                  mine
                    ? t('reports.hero.inOn', {
                        date: new Date(mine.submittedAt).toLocaleDateString(i18n.language, {
                          day: 'numeric',
                          month: 'long',
                        }),
                      })
                    : t('reports.hero.in')
                }
              />
            )}
          </View>
        </View>
      </View>

      {due ? (
        <>
          {call ? (
            <Text
              style={[
                styles.call,
                !closed && days !== null && days <= 4 ? styles.callUrgent : null,
              ]}
            >
              {call}
            </Text>
          ) : null}
          {!closed ? (
            <Pressable
              style={styles.primary}
              accessibilityRole="button"
              onPress={() =>
                router.push(`/service-reports/new?reportMonth=${data.reportMonth}` as any)
              }
            >
              <Text style={styles.primaryText}>{t('reports.entry.submit')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          {mine ? (
            <View style={styles.tiles}>
              {mine.hoursReported !== null ? (
                <Tile value={t('reports.hoursShort', { count: mine.hoursReported })} label={t('reports.hero.hours')} />
              ) : (
                <Tile
                  value={mine.servedThisMonth ? t('common.yes') : t('common.no')}
                  label={t('reports.hero.shared')}
                />
              )}
              <Tile value={String(mine.bibleStudies)} label={t('reports.hero.studies')} />
            </View>
          ) : null}
          {canEdit && data.reportId ? (
            <Pressable
              style={styles.soft}
              accessibilityRole="button"
              onPress={() => router.push(`/service-reports/new?id=${data.reportId}` as any)}
            >
              <Ionicons name="create-outline" size={15} color={BRAND} />
              <Text style={styles.softText}>
                {data.closesOn
                  ? t('reports.hero.correctUntil', { date: closesLabel })
                  : t('reports.entry.change')}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.call}>{t('reports.hero.correctByOverseer')}</Text>
          )}
        </>
      )}
    </View>
  );
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The last three ended months — the ones the form offers. */
function recentMonths(): string[] {
  const now = new Date();
  return [1, 2, 3].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

/** «2026/27» for a YYYY-MM month — September opens the next year. */
function serviceYearOf(month: string): number {
  const y = Number(month.slice(0, 4));
  return Number(month.slice(5, 7)) >= 9 ? y + 1 : y;
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
  const { isAdmin, isElder, responsibilities } = usePermissions();
  // Each row below stands for whoever its screen lets in — the screen's own
  // rule (lib/screen-access), not a copy of it.
  const mayOpen = useMayOpen();
  const { myPublisherId } = useMyPublisher();
  const now = new Date();
  const serviceYearNow =
    now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  // The year the annual report OPENS on — the ended one until 20 October,
  // as on its own screen (28 September: the row said «2026/2027» while the
  // screen opened 2025/2026).
  const annualYear =
    now.getMonth() === 8 || (now.getMonth() === 9 && now.getDate() <= 20)
      ? serviceYearNow - 1
      : serviceYearNow;
  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    throwOnError: failsScreen,
    queryKey: ['service-reports', 'my'],
    queryFn: () => serviceReportsApi.listMy(),
  });
  const standingQ = useQuery({
    queryKey: ['my-report-standing'],
    queryFn: () => serviceReportsApi.myStanding(),
  });
  const navigation = useNavigation();
  const noCardYet =
    (error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code ===
    'NO_OWN_CARD';
  // «+» only while one of the months the form offers is still to hand in.
  const handedIn = new Set((data ?? []).map((r) => r.reportMonth.slice(0, 7)));
  const somethingToFile = !!data && !noCardYet && recentMonths().some((m) => !handedIn.has(m));
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: somethingToFile
        ? () => (
            <Pressable
              onPress={() => router.push('/service-reports/new' as any)}
              style={{ paddingHorizontal: 8 }}
              hitSlop={8}
              accessibilityLabel={t('reports.title.new')}
            >
              <Ionicons name="add" size={28} color={HEADER_ICON} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, somethingToFile, t]);
  // A section line that says its own number answers the question before it is
  // opened, and half the visits here stop being necessary. Only ONE extra
  // request, and one the app already makes elsewhere: «сдали столько-то из
  // стольких-то» is precisely what the collection card holds. The other
  // sections stay unlabelled rather than cost four more round trips on a phone
  // in a Kingdom Hall with poor signal.
  // «Отчёты по группе» opens for those the server lets in (findGroupReports):
  // administrators, elders and the secretary see the whole congregation; the
  // overseer of a group and his assistant see their groups. For anybody else
  // the row led to «Нет доступа» (audit, 25 September) — so it is not shown.
  // The groups list is the one Home already keeps in its cache.
  const secretary = responsibilities.has('secretary');
  const groups = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 30 * 60 * 1000,
    enabled: !isAdmin && !isElder && !secretary && !!myPublisherId,
  });
  const oversees =
    !!myPublisherId &&
    (groups.data?.data ?? []).some(
      (g) => g.overseerPublisherId === myPublisherId || g.assistantPublisherId === myPublisherId,
    );
  const canViewGroupReports = isAdmin || isElder || secretary || oversees;
  // The count of the collection is the server's for the administrator, the
  // secretary and a group overseer only; an elder is refused it, so he is not
  // sent to ask.
  const collection = useQuery({
    queryKey: ['report-collection'],
    queryFn: () => serviceReportsApi.getCollection(),
    enabled: isAdmin || secretary || oversees,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // NO CARD OF ONE'S OWN (audit, 22 October 2026): an administrator's login
  // with no publisher card got only the red line here — not the group
  // reports, the summary, the annual report he is there for. Only «my
  // months» needs a card; the rest of the screen stands.
  const noCard = (error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code === 'NO_OWN_CARD';
  if (error && !noCard) {
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

  // Grouped by service year, the newest first — the year is how reports are
  // read everywhere else (the S-21 card, the annual report).
  const byYear = new Map<number, ServiceReport[]>();
  for (const r of reports) {
    const y = serviceYearOf(r.reportMonth);
    byYear.set(y, [...(byYear.get(y) ?? []), r]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
              void standingQ.refetch();
            }}
          />
        }
      >
        <MonthCard standing={standingQ.data} />
        {standingQ.data?.pioneerYear ? (
          <View style={cardStyles.card}>
            <PioneerYear year={standingQ.data.pioneerYear} />
          </View>
        ) : null}

        {canViewGroupReports ? (
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
            onPress={() => router.push('/service-reports/group' as any)}
          />
        ) : null}
        {/* The attendance sheet is for the elders and for those who
            count at the meeting — not a publisher's errand. */}
        {mayOpen('/service-reports/attendance') ? (
          <SectionRow
            icon="people-circle-outline"
            label={t('attendance.pageTitle')}
            onPress={() => router.push('/service-reports/attendance' as any)}
          />
        ) : null}
        {mayOpen('/service-reports/summary') ? (
          <SectionRow
            icon="stats-chart-outline"
            label={t('reports.summary.title')}
            onPress={() => router.push('/service-reports/summary' as any)}
          />
        ) : null}
        {/* The annual report stays the secretary's. */}
        {mayOpen('/service-reports/annual') ? (
          <SectionRow
            icon="clipboard-outline"
            label={t('annualReport.pageTitle')}
            // No request for this one: which service year we are in is
            // arithmetic, and September starts the next.
            value={t('reports.entry.serviceYear', {
              from: annualYear,
              to: annualYear + 1,
            })}
            onPress={() => router.push('/service-reports/annual' as any)}
          />
        ) : null}
        {mayOpen('/service-reports/activity') ? (
          <SectionRow
            icon="pulse-outline"
            label={t('reports.title.activity')}
            onPress={() => router.push('/service-reports/activity' as any)}
          />
        ) : null}

        {noCard ? (
          // An administrator's login with no card of its own: an ordinary
          // state, said quietly (it was a red error box).
          <Text style={styles.noCard}>{t('reports.hero.noCard')}</Text>
        ) : reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={56} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{t('reports.noReports')}</Text>
            <Text style={styles.emptySubtitle}>{t('reports.noReportsHint')}</Text>
          </View>
        ) : (
          years.map((y, i) => (
            <View key={y}>
              <View style={styles.sectHead}>
                <Text style={styles.kicker}>{i === 0 ? t('reports.entry.myMonths') : ''}</Text>
                <Text style={styles.sectYear}>{`${y - 1}/${String(y).slice(2)}`}</Text>
              </View>
              {byYear.get(y)!.map((r) => (
                <ReportRow key={r.id} report={r} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ReportRow({ report }: { report: ServiceReport }) {
  const shared = report.hoursReported !== null ? (report.hoursReported ?? 0) > 0 : !!report.servedThisMonth;
  return (
    <View style={styles.row}>
      <MonthPlaque month={report.reportMonth} small />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{formatActivity(report)}</Text>
        <Text style={styles.rowSub}>
          {report.bibleStudies > 0
            ? i18n.t('reports.studies', { count: report.bibleStudies })
            : i18n.t('reports.hero.noStudies')}
        </Text>
        {report.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            {report.notes}
          </Text>
        ) : null}
        {report.lastEditedAt ? (
          <Text style={styles.editInfo}>
            {report.lastEditedByName
              ? i18n.t('reports.editedAtBy', { when: formatEditedTime(report.lastEditedAt), name: report.lastEditedByName })
              : i18n.t('reports.editedAt', { when: formatEditedTime(report.lastEditedAt) })}
          </Text>
        ) : null}
      </View>
      {report.canEdit ? (
        <Pressable
          onPress={() => router.push(`/service-reports/new?id=${report.id}` as any)}
          style={styles.editBtn}
          hitSlop={8}
          accessibilityLabel={i18n.t('reports.entry.change')}
        >
          <Ionicons name="create-outline" size={19} color={BRAND} />
        </Pressable>
      ) : (
        <View style={[styles.dot, !shared && styles.dotOff]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 14, paddingBottom: 40 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  kicker: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontFamily: 'Manrope_800ExtraBold',
  },
  heroTitle: { fontSize: 22, color: INK, fontFamily: 'Manrope_800ExtraBold', letterSpacing: -0.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  call: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#475569', marginTop: 12, lineHeight: 19 },
  callUrgent: { color: '#b45309', fontFamily: 'Manrope_700Bold' },
  primary: {
    marginTop: 14,
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15.5, fontFamily: 'Manrope_800ExtraBold' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  soft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  softText: { color: BRAND, fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
  },
  sectionValue: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED, marginTop: 1 },
  sectionLabel: { fontSize: 15, color: INK, fontFamily: 'Manrope_600SemiBold' },
  sectHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 9,
    paddingHorizontal: 4,
  },
  sectYear: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#94a3b8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowTitle: { fontSize: 14.5, fontFamily: 'Manrope_700Bold', color: INK },
  rowSub: { fontSize: 12.5, fontFamily: 'Manrope_400Regular', color: MUTED, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#10b981', marginRight: 4 },
  dotOff: { backgroundColor: '#cbd5e1' },
  editBtn: { padding: 6 },
  editInfo: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#94a3b8', marginTop: 4 },
  notes: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#475569', marginTop: 4, lineHeight: 17 },
  noCard: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#94a3b8', marginTop: 16, paddingHorizontal: 4, lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'Manrope_600SemiBold', color: '#475569', marginTop: 14 },
  emptySubtitle: {
    fontFamily: 'Manrope_400Regular',
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
  errorText: { fontFamily: 'Manrope_400Regular', color: '#dc2626', fontSize: 14 },
});
