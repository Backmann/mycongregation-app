import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  CleaningAssignment,
  cleaningApi,
  meetingSettingsApi,
  serviceGroupsApi,
  specialEventsApi,
} from '../../../lib/api';
import { addDays, addWeeks, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { usePermissions } from '../../../lib/permissions';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { weekRules } from '../../../lib/week-rules';
import { printCleaningQuarter } from '../../../lib/print-cleaning-quarter';
import { formatWeekRange } from '../../../lib/week-range';
import { FONT } from '../../../lib/typography';
import { HEADER_ICON } from '../../../lib/header';
import { CleaningWeekEditor } from '../../../components/CleaningWeekEditor';
import { WindowsLine, WindowsPlanDialog } from '../../../components/WindowsPlan';

const INK = '#0f172a';
const SOFT = '#64748b';
const ACC = '#0369a1';
const WARN = '#b45309';
const LINE = '#eef2f6';
const FIRST = 12;
const MORE = 8;
/** Weeks brought back per tap of «show past weeks». */
const PAST_STEP = 8;

const atMidnight = (iso: string) => new Date(`${iso}T00:00:00`);

/**
 * «Hall cleaning» — the weeks ahead, one row each, and a tap opens that week.
 *
 * Three people read the same list three ways. A publisher asks when his group
 * cleans: those rows carry «your group» in blue. A group's overseer may set the
 * day of his group's weekly cleaning himself (cleaning.service canPlanThorough):
 * a week that waits for his day says so, in amber — it is his to do. The
 * coordinator distributes the weeks: an after-meeting slot left empty is a
 * real gap (every week but a convention's, one group for both meetings) and
 * is amber to him; a week without the weekly cleaning is only shown, in grey,
 * because that one is sometimes skipped on purpose. To everyone else an empty
 * slot is grey: not theirs to fix.
 *
 * Nothing on the server treats an unassigned week as a gap — no reminder goes
 * out for it — so this list is the only place such a week becomes visible.
 *
 * Wide screens: the list on the left, the chosen week's editor on the right.
 */
export default function CleaningScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const { myPublisher, myPublisherId } = useMyPublisher();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));
  const [count, setCount] = useState(FIRST);
  // Past weeks on request: the programme screen let a coordinator page back
  // and correct who actually cleaned, and this list must not take that away.
  const [pastCount, setPastCount] = useState(0);
  const [chosen, setChosen] = useState(thisMonday);
  const [planWindows, setPlanWindows] = useState<number[] | null>(null);
  const startISO = formatDateISO(addWeeks(atMidnight(thisMonday), -pastCount));
  const weeks = useMemo(
    () => Array.from({ length: pastCount + count }, (_, i) => formatDateISO(addWeeks(atMidnight(startISO), i))),
    [count, pastCount, startISO],
  );
  const endISO = formatDateISO(addWeeks(atMidnight(thisMonday), count));

  const rangeQ = useQuery({
    queryKey: ['cleaning', 'range', startISO, endISO],
    queryFn: () => cleaningApi.range(startISO, endISO),
  });
  const groupsQ = useQuery({ queryKey: ['service-groups'], queryFn: () => serviceGroupsApi.list({}) });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });

  // A week's edits refresh ['cleaning', week]; this list reads a range. Rather
  // than chase every place that edits a week — the overseer's day is set deep
  // inside the cleaning detail — the list watches the cache: whenever a single
  // week's cleaning is fetched anew, the ranges are re-read.
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const key = event.query.queryKey;
      if (key[0] === 'cleaning' && key[1] !== 'range') {
        queryClient.invalidateQueries({ queryKey: ['cleaning', 'range'] });
      }
    });
  }, [queryClient]);

  const groups = groupsQ.data?.data ?? [];
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const myGroupId = myPublisher?.serviceGroupId ?? null;
  const overseerOf = new Set(groups.filter((g) => !!myPublisherId && g.overseerPublisherId === myPublisherId).map((g) => g.id));
  const coordinator = perms.canEditCleaning;

  const byWeek = new Map<string, CleaningAssignment[]>();
  for (const a of rangeQ.data ?? []) {
    const list = byWeek.get(a.weekStartDate) ?? [];
    list.push(a);
    byWeek.set(a.weekStartDate, list);
  }

  const canPrint = perms.canEditCleaning || perms.isElder || perms.isAdmin;
  const print = () =>
    printCleaningQuarter({
      weekStart: atMidnight(wide ? chosen : thisMonday),
      meetingVersion: effectiveVersionFor(settingsQ.data?.versions, wide ? chosen : thisMonday),
      events: eventsQ.data ?? [],
      congregationName: settingsQ.data?.congregation.name ?? null,
      t,
      lang,
      onBusy: () => {},
    });

  const open = (week: string) => {
    if (wide) setChosen(week);
    else router.push(`/publishers/cleaning-week?week=${week}` as never);
  };

  const dayOf = (iso: string) =>
    new Date(iso).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });

  let lastMonth = -1;
  const rows = weeks.flatMap((week, i) => {
    const monday = atMidnight(week);
    const sunday = addDays(monday, 6);
    const out: ReactNode[] = [];
    if (i === 0 && pastCount > 0) {
      out.push(
        <Text key="past" style={styles.label}>
          {t('cleaningHall.past')}
        </Text>,
      );
    } else if (week === thisMonday) {
      out.push(
        <View key="now" style={styles.nowRow}>
          <Text style={styles.nowText}>{t('cleaningHall.thisWeek')}</Text>
          <View style={styles.nowRule} />
        </View>,
      );
    } else if (i > 0 && monday.getMonth() !== lastMonth) {
      out.push(
        <Text key={`m${week}`} style={styles.label}>
          {monday.toLocaleDateString(lang, { month: 'long' })}
        </Text>,
      );
    }
    lastMonth = monday.getMonth();

    const rules = weekRules({
      weekStartISO: week,
      version: effectiveVersionFor(settingsQ.data?.versions, week),
      events: eventsQ.data ?? [],
    });
    const list = byWeek.get(week) ?? [];
    const after = list.find((a) => a.slotType === 'after_meeting' && a.serviceGroupId);
    const weekly = list.find((a) => a.slotType === 'thorough' && a.serviceGroupId);
    const general = list.find((a) => a.slotType === 'general');

    let title: string;
    let titleStyle: TextStyle = styles.title;
    const lines: { text: string; style: TextStyle }[] = [];
    if (rules.congress) {
      title = t('cleaningHall.congressWeek', { event: t(`specialEvents.types.${rules.congress.type}`) });
      titleStyle = styles.titleSoft;
    } else {
      if (after) {
        title = t('cleaningHall.after', { group: groupName.get(after.serviceGroupId!) ?? '—' });
      } else {
        title = t('cleaningHall.afterMissing');
        titleStyle = coordinator ? styles.titleWarn : styles.titleSoft;
      }
      if (weekly) {
        const when = weekly.thoroughPlannedAt ? dayOf(weekly.thoroughPlannedAt) : t('cleaningHall.dayNotSet');
        lines.push({ text: t('cleaningHall.weekly', { group: groupName.get(weekly.serviceGroupId!) ?? '—', when }), style: styles.sub });
      } else if (coordinator) {
        lines.push({ text: t('cleaningHall.weeklyMissing'), style: styles.sub });
      }
      if (general) {
        const when = general.thoroughPlannedAt ? dayOf(general.thoroughPlannedAt) : t('cleaningHall.dateTbd');
        lines.push({ text: t('cleaningHall.general', { when }), style: styles.sub });
      }
      // «Yours» — the group's own weeks, and the overseer's day to set.
      if (weekly && overseerOf.has(weekly.serviceGroupId!) && !weekly.thoroughPlannedAt) {
        lines.push({ text: t('cleaningHall.mineWeeklyPlan'), style: styles.mineWarn });
      } else if (weekly && myGroupId && weekly.serviceGroupId === myGroupId) {
        lines.push({ text: t('cleaningHall.mineWeekly'), style: styles.mine });
      }
      if (after && myGroupId && after.serviceGroupId === myGroupId) {
        lines.push({ text: t('cleaningHall.mineAfter'), style: styles.mine });
      }
    }

    const selected = wide && week === chosen;
    // A row that holds «На плане» must not itself be a button: on the web a
    // button role renders a <button>, and a button inside a button is invalid
    // HTML — the browser rewrites it while parsing, taps can land on the wrong
    // one, and screen readers read the pair as one (found by the screen audit,
    // 24 September, on every role). Such a row stays pressable; the windows,
    // read out as part of its label, are the one thing its role gave up.
    const hasPlan = !!weekly?.windows?.length;
    const rowLabel = `${monday.toLocaleDateString(lang, { day: 'numeric', month: 'long' })} — ${sunday.toLocaleDateString(lang, { day: 'numeric', month: 'long' })}. ${title}`;
    out.push(
      <Pressable
        key={week}
        onPress={() => open(week)}
        style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
        accessibilityRole={hasPlan ? undefined : 'button'}
        accessibilityLabel={
          hasPlan ? `${rowLabel}. ${t('cleaningHall.windows', { list: weekly!.windows!.join(', ') })}` : rowLabel
        }
      >
        <View style={styles.dateCol}>
          <Text style={styles.day}>{monday.getDate()}</Text>
          <Text style={styles.days}>
            {`–${sunday.toLocaleDateString(lang, { day: 'numeric' })} ${sunday.toLocaleDateString(lang, { month: 'short' }).replace('.', '')}`}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={titleStyle}>{title}</Text>
          {lines.map((l, k) => (
            <View key={k}>
              {/* Two lines: one cut «day not se…» off — the very thing the
                  line is there to say. */}
              <Text style={l.style} numberOfLines={2}>
                {l.text}
              </Text>
              {/* The weekly line comes first; its windows go right under it. */}
              {k === 0 && weekly?.windows?.length ? (
                <WindowsLine windows={weekly.windows} onOpen={() => setPlanWindows(weekly.windows)} />
              ) : null}
            </View>
          ))}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </Pressable>,
    );
    return out;
  });

  const list = (
    <ScrollView style={wide ? styles.listPane : styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Pressable
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          onPress={() => setPastCount((n) => n + PAST_STEP)}
          accessibilityRole="button"
        >
          <Text style={styles.moreText}>{t('cleaningHall.showPast')}</Text>
        </Pressable>
        {rows}
        <Pressable
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          onPress={() => setCount((c) => c + MORE)}
          accessibilityRole="button"
        >
          <Text style={styles.moreText}>{t('cleaningHall.showMore')}</Text>
        </Pressable>
        <Text style={styles.label}>{t('cleaningHall.guideSection')}</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() => router.push('/cleaning/guide' as never)}
          accessibilityRole="button"
        >
          <View style={styles.body}>
            <Text style={styles.title}>{t('cleaningGuide.title')}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {t('cleaningGuide.rowSubtitle')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      </View>
    </ScrollView>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: canPrint
            ? () => (
                <Pressable
                  onPress={print}
                  style={{ paddingHorizontal: 12 }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('cleaningHall.print')}
                >
                  <Ionicons name="print-outline" size={22} color={HEADER_ICON} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <WindowsPlanDialog windows={planWindows} onClose={() => setPlanWindows(null)} />
      {wide ? (
        <View style={styles.split}>
          {list}
          <View style={styles.detailPane}>
            <Text style={styles.detailTitle}>
              {formatWeekRange(atMidnight(chosen), lang)}
            </Text>
            <CleaningWeekEditor key={chosen} weekStartISO={chosen} />
          </View>
        </View>
      ) : (
        list
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 },
  split: { flex: 1, flexDirection: 'row', backgroundColor: '#ffffff' },
  listPane: { width: 440, flexGrow: 0, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  detailPane: { flex: 1, backgroundColor: '#f6f8fb' },
  detailTitle: { fontSize: 22, fontFamily: FONT.extrabold, color: INK, paddingHorizontal: 16, paddingTop: 20 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  nowText: { fontSize: 12, fontFamily: FONT.extrabold, letterSpacing: 1, color: ACC, textTransform: 'uppercase' },
  nowRule: { flex: 1, height: 1, backgroundColor: '#bae6fd' },
  label: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowSelected: { backgroundColor: '#f0f9ff' },
  pressed: { backgroundColor: '#f8fafc' },
  dateCol: { width: 56, alignItems: 'center' },
  day: { fontSize: 24, fontFamily: FONT.extrabold, color: INK, lineHeight: 28 },
  days: { fontSize: 11, fontFamily: FONT.bold, color: SOFT, marginTop: 2 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15.5, fontFamily: FONT.bold, color: INK },
  titleWarn: { fontSize: 15.5, fontFamily: FONT.bold, color: WARN },
  titleSoft: { fontSize: 15.5, fontFamily: FONT.semibold, color: SOFT },
  sub: { fontSize: 13.5, fontFamily: FONT.medium, color: SOFT, marginTop: 3 },
  mine: { fontSize: 13.5, fontFamily: FONT.bold, color: ACC, marginTop: 4 },
  mineWarn: { fontSize: 13.5, fontFamily: FONT.bold, color: WARN, marginTop: 4 },
  more: {
    margin: 16,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontSize: 15, fontFamily: FONT.bold, color: ACC },
});
