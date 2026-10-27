import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  dutiesApi,
  dutyPlacesApi,
  meetingSettingsApi,
  Publisher,
  publishersApi,
  specialEventsApi,
} from '../../../lib/api';
import { addWeeks, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { usePermissions } from '../../../lib/permissions';
import { weekRules } from '../../../lib/week-rules';
import { printDutiesMonth } from '../../../lib/print-duties-month';
import { FONT } from '../../../lib/typography';
import { HEADER_ICON } from '../../../lib/header';
import { DutiesMeetingEditor, type DutyMeeting } from '../../../components/DutiesMeetingEditor';
import { DutiesMonth } from '../../../components/duties/DutiesMonth';
import { IdleCard } from '../../../components/duties/IdleCard';
import { failsScreen } from '../../../lib/screen-failure';
import { useMayOpen } from '../../../lib/useMayOpen';
import { OPTIONAL_DUTY_TYPES } from '../../../lib/duty-count';
import { capitalizeFirst } from '../../../lib/relative-time';
import { countedPlaces } from '../../../lib/duty-places';

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#eef2f6';
const MEETING_DOT = '#f59e0b';
const FIRST = 8;
const MORE = 6;

const atMidnight = (iso: string) => new Date(`${iso}T00:00:00`);

type Row =
  | { kind: 'meeting'; week: string; meeting: DutyMeeting; dateISO: string; time: string | null }
  | { kind: 'congress'; week: string; event: string };

/**
 * «Meeting duties» — the coming meetings, one row each, with how many places
 * are filled: «duties 3 of 8», counted, without colour — some places (the
 * ventilation) are filled one week and not the next, so the sheet is only
 * counted, not judged (Lionel's decision of 20 September). A tap opens that
 * meeting's sheet; on a wide screen it opens on the right.
 *
 * Those who edit duties edit here; elders and admins read and print here too,
 * as they could in the programme screen before duties left it. The screen
 * checks the right itself, since an address can be typed. Everyone else reads
 * the duties in the feed.
 *
 * Which meetings a week holds is the week rules' answer: a convention takes
 * both, the Memorial stands in the place of the meeting it takes.
 */
export default function DutiesScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const perms = usePermissions();
  const mayOpen = useMayOpen();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  // The month table wants its room: a place column, eight or nine meetings
  // and the panel beside them (27 October 2026). Narrower windows keep the
  // list of meetings.
  const tableRoom = width >= 1200;
  const [mode, setMode] = useState<'month' | 'meeting'>('month');
  const showMonth = tableRoom && mode === 'month';
  // Reading and printing: whoever edits duties, and every elder and admin —
  // the programme screen printed duties for elders, and moving must not take
  // that away. Editing inside a sheet stays canEditDuties.
  const canView = perms.canEditDuties || perms.isElder || perms.isAdmin;

  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));
  const todayISO = formatDateISO(new Date());
  const [count, setCount] = useState(FIRST);
  const [chosen, setChosen] = useState<{ week: string; meeting: DutyMeeting } | null>(null);
  const weeks = useMemo(
    () => Array.from({ length: count }, (_, i) => formatDateISO(addWeeks(atMidnight(thisMonday), i))),
    [count, thisMonday],
  );
  const endISO = formatDateISO(addWeeks(atMidnight(thisMonday), count));

  const dutiesQ = useQuery({
    throwOnError: failsScreen,
    queryKey: ['duties', 'range', thisMonday, endISO],
    queryFn: () => dutiesApi.list({ weekStart: thisMonday, weekEnd: endISO }),
    enabled: canView,
  });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const rosterQ = useQuery({ queryKey: ['publishers', 'roster'], queryFn: () => publishersApi.roster() });
  // A meeting nobody has filled has no sheet; its count comes from the
  // congregation's places, as on «Собрание» («0 из 8», not «not filled»).
  const midPlacesQ = useQuery({ queryKey: ['duty-places', 'midweek'], queryFn: () => dutyPlacesApi.get('midweek') });
  const endPlacesQ = useQuery({ queryKey: ['duty-places', 'weekend'], queryFn: () => dutyPlacesApi.get('weekend') });

  // A meeting's edits refresh ['duties', week]; this list reads a range. It
  // watches the cache and re-reads the ranges whenever a single week's duties
  // are fetched anew — which also keeps the feed's counts fresh.
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const key = event.query.queryKey;
      if (key[0] === 'duties' && key[1] !== 'range') {
        queryClient.invalidateQueries({ queryKey: ['duties', 'range'] });
      }
    });
  }, [queryClient]);

  const counts = new Map<string, { total: number; assigned: number }>();
  for (const d of dutiesQ.data ?? []) {
    // The timekeeper is a place a congregation may leave empty: counted
    // neither here nor on «Собрание» («0 из 8» there, «0/9» here — walk,
    // 23 October 2026; server readiness OPTIONAL_DUTIES). The meeting's own
    // sheet counts by the same rule (lib/duty-count).
    if (OPTIONAL_DUTY_TYPES.has(d.dutyType)) continue;
    const key = `${d.weekStartDate}|${d.eventType}`;
    const c = counts.get(key) ?? { total: 0, assigned: 0 };
    c.total += 1;
    if (d.publisherId) c.assigned += 1;
    counts.set(key, c);
  }

  const rows: Row[] = [];
  for (const week of weeks) {
    const version = effectiveVersionFor(settingsQ.data?.versions, week);
    const rules = weekRules({ weekStartISO: week, version, events: eventsQ.data ?? [] });
    if (rules.congress) {
      rows.push({ kind: 'congress', week, event: t(`specialEvents.types.${rules.congress.type}`) });
      continue;
    }
    for (const m of ['midweek', 'weekend'] as const) {
      let meeting: DutyMeeting | null = m;
      let dateISO: string | null = rules.dateOf(m);
      let time: string | null = ((m === 'midweek' ? version?.midweekTime : version?.weekendTime) || '').slice(0, 5) || null;
      if (rules.memorialTakes === m && rules.memorial) {
        meeting = 'memorial';
        dateISO = rules.memorial.date;
        time = rules.memorial.time ?? null;
      } else if (rules.isTakenAway(m)) {
        meeting = null;
      }
      if (!meeting || !dateISO || dateISO < todayISO) continue;
      rows.push({ kind: 'meeting', week, meeting, dateISO, time });
    }
  }
  const firstMeeting = rows.find((r) => r.kind === 'meeting') as Extract<Row, { kind: 'meeting' }> | undefined;
  const selected = chosen ?? (firstMeeting ? { week: firstMeeting.week, meeting: firstMeeting.meeting } : null);

  const publishersById = new Map<string, Publisher>((rosterQ.data?.data ?? []).map((p) => [p.id, p]));
  const canPrint = perms.canEditDuties || perms.isElder || perms.isAdmin;
  // The month the table shows — kept here so the print button prints it.
  const [tableMonth, setTableMonth] = useState<string | null>(null);
  const shownMonth = tableMonth ?? (firstMeeting?.dateISO ?? todayISO).slice(0, 7);
  // Printing: the month on screen in the table; by meeting, the month of
  // the chosen meeting's own day (not its week's Monday).
  const printMonth = showMonth
    ? shownMonth
    : (rows.find((r) => r.kind === 'meeting' && selected && r.week === selected.week && r.meeting === selected.meeting) as
        | Extract<Row, { kind: 'meeting' }>
        | undefined)?.dateISO.slice(0, 7) ?? shownMonth;
  const print = () => {
    const v = effectiveVersionFor(settingsQ.data?.versions, `${printMonth}-01`);
    void printDutiesMonth({
      month: printMonth,
      congregationName: settingsQ.data?.congregation.name ?? null,
      hallAddress: v?.address ?? null,
      nameOf: (id) => publishersById.get(id)?.displayName ?? null,
      t,
      lang,
      onBusy: () => {},
    });
  };

  const open = (week: string, meeting: DutyMeeting) => {
    if (wide) setChosen({ week, meeting });
    else router.push(`/publishers/duties-meeting?week=${week}&meeting=${meeting}` as never);
  };

  let lastMonth = -1;
  const items = rows.flatMap((r, i) => {
    const out: ReactNode[] = [];
    const day = atMidnight(r.kind === 'meeting' ? r.dateISO : r.week);
    if (i > 0 && day.getMonth() !== lastMonth) {
      out.push(
        <Text key={`m${r.week}${i}`} style={styles.label}>
          {day.toLocaleDateString(lang, { month: 'long' })}
        </Text>,
      );
    }
    lastMonth = day.getMonth();
    if (r.kind === 'congress') {
      out.push(
        <View key={`c${r.week}`} style={styles.row}>
          <View style={styles.dateCol}>
            <Text style={styles.day}>{day.getDate()}</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.titleSoft}>{t('dutiesScreen.congress', { event: r.event })}</Text>
          </View>
        </View>,
      );
      return out;
    }
    const sheet = counts.get(`${r.week}|${r.meeting}`);
    const template =
      r.meeting === 'midweek' ? midPlacesQ.data?.places : r.meeting === 'weekend' ? endPlacesQ.data?.places : undefined;
    const c = sheet ?? (template ? { total: countedPlaces(template), assigned: 0 } : undefined);
    // The count stands alone on its line here, so it starts with a capital like
    // «Обязанности ещё не заполнены» below it; in the feed it follows a «·».
    const line =
      c && c.total > 0
        ? capitalizeFirst(t('feed.dutiesShort', { assigned: c.assigned, total: c.total }))
        : t('duties.noDuties');
    const isSel = wide && !!selected && selected.week === r.week && selected.meeting === r.meeting;
    const dow = day.toLocaleDateString(lang, { weekday: 'short' }).replace('.', '').toUpperCase();
    out.push(
      <Pressable
        key={`${r.week}|${r.meeting}`}
        onPress={() => open(r.week, r.meeting)}
        style={({ pressed }) => [styles.row, isSel && styles.rowSelected, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${day.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}. ${t(`eventTypes.${r.meeting}`)}. ${line}`}
      >
        <View style={styles.dateCol}>
          <Text style={styles.day}>{day.getDate()}</Text>
          <Text style={styles.dow}>{dow}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={styles.dot} />
            <Text style={styles.title} numberOfLines={2}>
              {t(`eventTypes.${r.meeting}`)}
            </Text>
            {r.time ? <Text style={styles.time}>{r.time}</Text> : null}
          </View>
          <Text style={styles.sub}>{line}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </Pressable>,
    );
    return out;
  });

  const modeSwitch = (
    <View style={styles.seg}>
      {(['month', 'meeting'] as const).map((m) => (
        <Pressable
          key={m}
          testID={`duties-mode-${m}`}
          onPress={() => setMode(m)}
          style={[styles.segItem, mode === m && styles.segOn]}
        >
          <Text style={[styles.segText, mode === m && styles.segTextOn]}>{t(`dutiesMonth.mode.${m}`)}</Text>
        </Pressable>
      ))}
    </View>
  );

  const list = (
    <ScrollView style={wide ? styles.listPane : styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        {tableRoom ? modeSwitch : null}
        {!wide ? <IdleCard /> : null}
        {/* Where the places themselves are kept — once, for every meeting. */}
        {mayOpen('/publishers/duty-places') ? (
          <Pressable
            testID="duty-places-door"
            onPress={() => router.push('/publishers/duty-places' as never)}
            style={({ pressed }) => [styles.placesDoor, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={20} color="#0369a1" />
            <View style={styles.body}>
              <Text style={styles.placesTitle}>{t('dutyPlaces.title')}</Text>
              <Text style={styles.sub}>{t('dutyPlaces.door')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
        {items}
        <Pressable
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          onPress={() => setCount((n) => n + MORE)}
          accessibilityRole="button"
        >
          <Text style={styles.moreText}>{t('dutiesScreen.showMore')}</Text>
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
                  accessibilityLabel={t('dutiesScreen.print')}
                >
                  <Ionicons name="print-outline" size={22} color={HEADER_ICON} />
                </Pressable>
              )
            : undefined,
        }}
      />
      {showMonth ? (
        <View style={styles.flex}>
          <View style={styles.monthTop}>
            <View style={styles.monthSwitch}>{modeSwitch}</View>
            {mayOpen('/publishers/duty-places') ? (
              <Pressable
                onPress={() => router.push('/publishers/duty-places' as never)}
                style={({ pressed }) => [styles.placesBtn, pressed && styles.pressed]}
                testID="duty-places-door"
              >
                <Ionicons name="options-outline" size={17} color="#0369a1" />
                <Text style={styles.placesBtnText}>{t('dutyPlaces.title')}</Text>
              </Pressable>
            ) : null}
          </View>
          <DutiesMonth canEdit={perms.canEditDuties} month={shownMonth} onMonth={setTableMonth} />
        </View>
      ) : wide ? (
        <View style={styles.split}>
          {list}
          <View style={styles.detailPane}>
            {selected ? (
              <DutiesMeetingEditor
                key={`${selected.week}|${selected.meeting}`}
                weekStartISO={selected.week}
                meeting={selected.meeting}
              />
            ) : null}
          </View>
        </View>
      ) : (
        list
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  monthTop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  monthSwitch: { width: 280 },
  placesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  placesBtnText: { fontFamily: FONT.bold, fontSize: 13.5, color: '#0369a1' },
  seg: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 3, margin: 12, marginBottom: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9 },
  segOn: { backgroundColor: '#e0f2fe' },
  segText: { fontFamily: FONT.bold, fontSize: 13.5, color: '#64748b' },
  segTextOn: { color: '#0369a1' },
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720, paddingTop: 8 },
  note: { fontSize: 15, fontFamily: FONT.medium, color: SOFT, padding: 16 },
  split: { flex: 1, flexDirection: 'row', backgroundColor: '#ffffff' },
  listPane: { width: 440, flexGrow: 0, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  detailPane: { flex: 1, backgroundColor: '#f6f8fb' },
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
  dateCol: { width: 48, alignItems: 'center' },
  day: { fontSize: 24, fontFamily: FONT.extrabold, color: INK, lineHeight: 28 },
  dow: { fontSize: 11, fontFamily: FONT.bold, color: SOFT, marginTop: 2 },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MEETING_DOT },
  title: { flex: 1, fontSize: 15.5, fontFamily: FONT.bold, color: INK },
  titleSoft: { fontSize: 15.5, fontFamily: FONT.semibold, color: SOFT },
  time: { fontSize: 14, fontFamily: FONT.semibold, color: SOFT },
  sub: { fontSize: 13.5, fontFamily: FONT.medium, color: SOFT, marginTop: 3 },
  placesDoor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    margin: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  placesTitle: { fontSize: 15.5, fontFamily: FONT.bold, color: '#0369a1' },
  more: {
    margin: 16,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontSize: 15, fontFamily: FONT.bold, color: '#0369a1' },
});
