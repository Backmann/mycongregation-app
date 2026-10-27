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
import { addDays, addWeeks, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { formatDayRange } from '../../../lib/date-range';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { usePermissions } from '../../../lib/permissions';
import { weekRules } from '../../../lib/week-rules';
import { printDutiesMonth } from '../../../lib/print-duties-month';
import { FONT } from '../../../lib/typography';
import { fittedHeaderTitle, HEADER_ICON } from '../../../lib/header';
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
/**
 * Each kind of meeting in the colour and sign it wears in «Программа»
 * (schedule/index.tsx, 25 September): the weekday takes the colour of
 * «Сокровища», the weekend that of the public talk, the Memorial the amber
 * of a special day.
 */
const KIND: Record<DutyMeeting, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  midweek: { color: '#0e7490', bg: '#e0f2fe', icon: 'book-outline' },
  weekend: { color: '#6d28d9', bg: '#ede9fe', icon: 'sunny-outline' },
  memorial: { color: '#b45309', bg: '#fef3c7', icon: 'star-outline' },
};
const FIRST = 8;
const MORE = 6;

const twoIconTitle = fittedHeaderTitle(2);

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

  // The coming weeks, one card each (27 October 2026, Lionel chose it from
  // the mockup): every row used to look alike — the same amber dot, the same
  // long title — and a weekday told itself from a weekend only by one word in
  // the middle of it. A week is a pair of meetings, so it is drawn as one;
  // each kind wears its colour and sign from «Программа».
  type Week = { week: string; congress: string | null; meetings: Extract<Row, { kind: 'meeting' }>[] };
  const byWeek: Week[] = [];
  for (const r of rows) {
    let w = byWeek[byWeek.length - 1];
    if (!w || w.week !== r.week) {
      w = { week: r.week, congress: null, meetings: [] };
      byWeek.push(w);
    }
    if (r.kind === 'congress') w.congress = r.event;
    else w.meetings.push(r);
  }
  const nextWeek = byWeek.find((w) => w.meetings.length > 0)?.week;

  let lastMonth = -1;
  const items = byWeek.flatMap((w) => {
    const out: ReactNode[] = [];
    const day = atMidnight(w.meetings[0]?.dateISO ?? w.week);
    // Every month says its name — the first one too: «28 СР» used to hang
    // above «НОЯБРЬ» with no month of its own.
    if (day.getMonth() !== lastMonth) {
      out.push(
        <Text key={`m${w.week}`} style={styles.label}>
          {day.toLocaleDateString(lang, { month: 'long' })}
        </Text>,
      );
    }
    lastMonth = day.getMonth();
    const span = formatDayRange(w.week, formatDateISO(addDays(atMidnight(w.week), 6)), lang, { month: 'short' });
    if (w.congress) {
      out.push(
        <View key={`c${w.week}`} style={styles.congress}>
          <Ionicons name="people-outline" size={18} color={SOFT} />
          <View style={styles.body}>
            <Text style={styles.congressTitle}>{t('dutiesScreen.congress', { event: w.congress })}</Text>
            <Text style={styles.weekSpan}>{span}</Text>
          </View>
        </View>,
      );
      return out;
    }
    const isNext = w.week === nextWeek;
    out.push(
      <View key={`w${w.week}`} style={[styles.week, isNext && styles.weekNext]}>
        <View style={styles.weekHead}>
          <Text style={styles.weekSpan}>{span}</Text>
          {isNext ? <Text style={styles.nextTag}>{t('dutiesScreen.next')}</Text> : null}
        </View>
        {w.meetings.map((r, i) => meetingRow(r, i > 0, day.getMonth()))}
      </View>,
    );
    return out;
  });

  function meetingRow(r: Extract<Row, { kind: 'meeting' }>, divided: boolean, sectionMonth: number) {
    const sheet = counts.get(`${r.week}|${r.meeting}`);
    const template =
      r.meeting === 'midweek' ? midPlacesQ.data?.places : r.meeting === 'weekend' ? endPlacesQ.data?.places : undefined;
    const c = sheet ?? (template ? { total: countedPlaces(template), assigned: 0 } : undefined);
    const line =
      c && c.total > 0
        ? capitalizeFirst(t('feed.dutiesShort', { assigned: c.assigned, total: c.total }))
        : t('duties.noDuties');
    const k = KIND[r.meeting];
    const day = atMidnight(r.dateISO);
    // «ср 4»; a meeting that falls into the next month says its month too.
    const date = day
      .toLocaleDateString(lang, {
        weekday: 'short',
        day: 'numeric',
        ...(day.getMonth() !== sectionMonth ? { month: 'short' as const } : {}),
      })
      .replace(',', '');
    const isSel = wide && !!selected && selected.week === r.week && selected.meeting === r.meeting;
    return (
      <Pressable
        key={`${r.week}|${r.meeting}`}
        testID={`duties-meeting-${r.week}-${r.meeting}`}
        onPress={() => open(r.week, r.meeting)}
        style={({ pressed }) => [styles.meeting, divided && styles.meetingLine, isSel && styles.rowSelected, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${day.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}. ${t(`eventTypes.${r.meeting}`)}. ${line}`}
      >
        <View style={[styles.kindIcon, { backgroundColor: k.bg }]}>
          <Ionicons name={k.icon} size={18} color={k.color} />
        </View>
        <View style={styles.body}>
          <View style={styles.line1}>
            <Text style={[styles.kind, { color: k.color }]}>
              {t(`dutiesScreen.kind.${r.meeting}`)}
            </Text>
            <Text style={styles.date}>
              {date}
              {r.time ? <Text style={styles.time}>{`  ·  ${r.time}`}</Text> : null}
            </Text>
          </View>
          {c && c.total > 0 ? (
            <Filled total={c.total} assigned={c.assigned} color={k.color} />
          ) : (
            <Text style={styles.sub}>{line}</Text>
          )}
        </View>
        {c && c.total > 0 ? (
          <Text style={styles.count}>
            {c.assigned}
            <Text style={styles.countOf}>/{c.total}</Text>
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </Pressable>
    );
  }

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

  const placesInHeader = !showMonth && mayOpen('/publishers/duty-places');

  return (
    <>
      <Stack.Screen
        options={{
          ...(canPrint && placesInHeader ? { headerTitle: twoIconTitle } : {}),
          // «Места собрания» are set once a year: a sign in the header, not a
          // card over the list every day (Lionel, 27 October 2026). The month
          // table keeps its own button beside the mode switch.
          headerRight:
            canPrint || placesInHeader
              ? () => (
                  <View style={styles.headerIcons}>
                    {placesInHeader ? (
                      <Pressable
                        testID="duty-places-door"
                        onPress={() => router.push('/publishers/duty-places' as never)}
                        style={styles.headerIcon}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('dutyPlaces.title')}
                      >
                        <Ionicons name="options-outline" size={22} color={HEADER_ICON} />
                      </Pressable>
                    ) : null}
                    {canPrint ? (
                      <Pressable
                        onPress={print}
                        style={styles.headerIcon}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('dutiesScreen.print')}
                      >
                        <Ionicons name="print-outline" size={22} color={HEADER_ICON} />
                      </Pressable>
                    ) : null}
                  </View>
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
  listPane: { width: 440, flexGrow: 0, backgroundColor: '#f1f5f9', borderRightWidth: 1, borderRightColor: '#e2e8f0' },
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
  rowSelected: { backgroundColor: '#f0f9ff' },
  pressed: { backgroundColor: '#f8fafc' },
  body: { flex: 1, minWidth: 0 },
  sub: { fontSize: 13.5, fontFamily: FONT.medium, color: SOFT, marginTop: 3 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { paddingHorizontal: 10 },
  week: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  weekNext: { borderWidth: 2, borderColor: '#0e7490' },
  weekHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 9 },
  weekSpan: { flex: 1, fontSize: 12, fontFamily: FONT.bold, color: '#94a3b8', letterSpacing: 0.2 },
  nextTag: {
    fontSize: 10.5,
    fontFamily: FONT.extrabold,
    color: '#ffffff',
    backgroundColor: '#0e7490',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  meeting: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 11, minHeight: 60 },
  meetingLine: { borderTopWidth: 1, borderTopColor: LINE },
  kindIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  line1: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  kind: { fontSize: 15.5, fontFamily: FONT.extrabold },
  date: { flexShrink: 0, fontSize: 14, fontFamily: FONT.semibold, color: '#334155' },
  time: { fontSize: 13.5, fontFamily: FONT.medium, color: '#94a3b8' },
  count: { fontSize: 15, fontFamily: FONT.extrabold, color: '#334155', minWidth: 34, textAlign: 'right' },
  countOf: { fontSize: 13, fontFamily: FONT.semibold, color: '#94a3b8' },
  bar: { flexDirection: 'row', gap: 3, marginTop: 7 },
  tick: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#e2e8f0' },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: '#e2e8f0', marginTop: 7, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  congress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  congressTitle: { fontSize: 14.5, fontFamily: FONT.bold, color: '#475569' },
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

/**
 * How many of a meeting's places are taken, as ticks — one per place, in the
 * meeting's colour. Counted, not judged (20 September): no red for empty.
 * A sheet with more places than a row has room for ticks gets one bar.
 */
function Filled({ total, assigned, color }: { total: number; assigned: number; color: string }) {
  if (total > 12) {
    return (
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(100, (assigned / total) * 100)}%`, backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.bar}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.tick, i < assigned && { backgroundColor: color }]} />
      ))}
    </View>
  );
}
