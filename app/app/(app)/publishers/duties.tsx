import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  dutiesApi,
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
 * Only those who edit duties open this screen — the row in the contents is
 * theirs alone — and the screen checks the right itself, since an address can
 * be typed. Everyone else reads the duties in the feed.
 *
 * Which meetings a week holds is the week rules' answer: a convention takes
 * both, the Memorial stands in the place of the meeting it takes.
 */
export default function DutiesScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

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
    queryKey: ['duties', 'range', thisMonday, endISO],
    queryFn: () => dutiesApi.list({ weekStart: thisMonday, weekEnd: endISO }),
    enabled: perms.canEditDuties,
  });
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const rosterQ = useQuery({ queryKey: ['publishers', 'roster'], queryFn: () => publishersApi.roster() });

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
  const printWeek = selected?.week ?? thisMonday;
  const print = () =>
    printDutiesMonth({
      weekStart: atMidnight(printWeek),
      meetingVersion: effectiveVersionFor(settingsQ.data?.versions, printWeek),
      events: eventsQ.data ?? [],
      publishersById,
      congregationName: settingsQ.data?.congregation.name ?? null,
      t,
      lang,
      onBusy: () => {},
    });

  if (!perms.canEditDuties) {
    return (
      <View style={styles.screen}>
        <Text style={styles.note}>{t('dutiesScreen.noAccess')}</Text>
      </View>
    );
  }

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
    const c = counts.get(`${r.week}|${r.meeting}`);
    const line = c && c.total > 0 ? t('feed.dutiesShort', { assigned: c.assigned, total: c.total }) : t('duties.noDuties');
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

  const list = (
    <ScrollView style={wide ? styles.listPane : styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
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
      {wide ? (
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
  screen: { flex: 1, backgroundColor: '#ffffff' },
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
