import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import { assignmentsApi, meApi, type MyWeekMarks } from '../lib/api';
import { MyDot } from './MyDot';
import { SECTION_COLORS } from '../lib/section-colors';
import { isSameWeek, startOfWeekMonday } from '../lib/dates';

type Kind = 'midweek' | 'weekend';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentWeekStart: Date;
  /** Jump to a week and open that meeting's section. */
  onPick: (weekStart: Date, kind: Kind) => void;
  /**
   * Real meeting weekday (1 = Mon … 7 = Sun) for a given week, so the list
   * shows actual dates — including a midweek meeting moved by a CO visit.
   */
  dowForWeek: (weekStartISO: string, kind: Kind) => number | null;
  /** True when a circuit-overseer visit falls on that week (midweek marker). */
  isCoVisitWeek?: (weekStartISO: string) => boolean;
}

const PANEL_WIDTH = 250;

interface WeekRow {
  weekStartDate: string;
  hasMidweek: boolean;
  hasWeekend: boolean;
}

/** One entry of the list: a meeting, with its real date. */
interface MeetingEntry {
  weekStartDate: string;
  date: dayjs.Dayjs;
  coVisit: boolean;
}

export function WeekDrawer({
  visible,
  onClose,
  currentWeekStart,
  onPick,
  dowForWeek,
  isCoVisitWeek,
}: Props) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const slide = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const [kind, setKind] = useState<Kind>('midweek');

  const weeksQuery = useQuery({
    queryKey: ['assignments', 'published-weeks'],
    queryFn: () => assignmentsApi.publishedWeeks(),
    enabled: visible,
  });
  // Weeks where the signed-in publisher has a part, a duty or their group's
  // cleaning — rendered as small coloured dots next to each entry.
  const myWeeksQuery = useQuery({
    queryKey: ['me', 'weeks'],
    queryFn: () => meApi.weeks(),
    enabled: visible,
  });
  const marksByWeek = useMemo(() => {
    const m = new Map<string, MyWeekMarks>();
    for (const r of myWeeksQuery.data ?? []) m.set(r.weekStartDate, r);
    return m;
  }, [myWeeksQuery.data]);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -PANEL_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  // Turn published weeks into a list of meetings of the selected kind: the
  // current week on top, the rest grouped by the month the meeting falls in.
  const { currentEntry, groups } = useMemo(() => {
    const rows: WeekRow[] = weeksQuery.data ?? [];
    let current: MeetingEntry | null = null;
    const out: { key: string; label: string; entries: MeetingEntry[] }[] = [];
    for (const r of rows) {
      if (kind === 'midweek' ? !r.hasMidweek : !r.hasWeekend) continue;
      const dow = dowForWeek(r.weekStartDate, kind);
      if (!dow) continue;
      const date = dayjs(r.weekStartDate)
        .locale(i18n.language)
        .add(dow - 1, 'day');
      const entry: MeetingEntry = {
        weekStartDate: r.weekStartDate,
        date,
        coVisit: kind === 'midweek' && !!isCoVisitWeek?.(r.weekStartDate),
      };
      if (isSameWeek(new Date(r.weekStartDate), currentWeekStart)) {
        current = entry;
        continue;
      }
      const key = date.format('YYYY-MM');
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: date.format('MMMM YYYY'), entries: [] };
        out.push(g);
      }
      g.entries.push(entry);
    }
    return { currentEntry: current, groups: out };
  }, [weeksQuery.data, i18n.language, currentWeekStart, kind, dowForWeek, isCoVisitWeek]);

  const weekRange = (weekStartIso: string) => {
    const start = dayjs(weekStartIso).locale(i18n.language);
    const end = start.add(6, 'day');
    if (start.month() === end.month()) {
      return `${start.date()}–${end.date()} ${start.format('MMMM')}`;
    }
    return `${start.format('D MMM')} – ${end.format('D MMM')}`;
  };

  // One dot per kind of assignment, in the section's own colour: orange a
  // meeting part, red a duty, blue the group's cleaning, green a field service
  // meeting you conduct.
  const renderDots = (weekStartIso: string) => {
    const m = marksByWeek.get(weekStartIso);
    if (!m) return null;
    const hasPart = kind === 'midweek' ? m.midweekParts : m.weekendParts;
    const hasDuty = kind === 'midweek' ? m.midweekDuties : m.weekendDuties;
    if (!hasPart && !hasDuty && !m.cleaning && !m.fieldService) return null;
    return (
      <View style={styles.dots}>
        {hasPart ? (
          <MyDot size={7} color={SECTION_COLORS.meeting.color} />
        ) : null}
        {hasDuty ? <MyDot size={7} color={SECTION_COLORS.duty.color} /> : null}
        {m.cleaning ? (
          <MyDot size={7} color={SECTION_COLORS.cleaning.color} />
        ) : null}
        {m.fieldService ? (
          <MyDot size={7} color={SECTION_COLORS.field_service.color} />
        ) : null}
      </View>
    );
  };

  const renderEntry = (e: MeetingEntry, isCurrent: boolean) => (
    <Pressable
      key={e.weekStartDate}
      style={[styles.row, isCurrent && styles.rowCurrent]}
      onPress={() => {
        onPick(startOfWeekMonday(new Date(e.weekStartDate)), kind);
        onClose();
      }}
    >
      <View
        style={[
          styles.dateBox,
          kind === 'weekend' ? styles.dateBoxWeekend : styles.dateBoxMidweek,
        ]}
      >
        <Text
          style={[
            styles.dateDow,
            kind === 'weekend' ? styles.textWeekend : styles.textMidweek,
          ]}
        >
          {e.date.format('dd')}
        </Text>
        <Text
          style={[
            styles.dateDay,
            kind === 'weekend' ? styles.textWeekend : styles.textMidweek,
          ]}
        >
          {e.date.date()}
        </Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowDate, isCurrent && styles.rowDateCurrent]}>
          {e.date.format('D MMMM')}
        </Text>
        <Text style={styles.rowWeek}>{weekRange(e.weekStartDate)}</Text>
      </View>
      {e.coVisit ? (
        <View style={styles.coBadge}>
          <Text style={styles.coBadgeText}>{t('weekDrawer.coShort')}</Text>
        </View>
      ) : null}
      {renderDots(e.weekStartDate)}
    </Pressable>
  );

  const tab = (value: Kind, label: string) => (
    <Pressable
      style={[styles.tab, kind === value && styles.tabActive]}
      onPress={() => setKind(value)}
    >
      <Text style={[styles.tabText, kind === value && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.panel,
            { height, transform: [{ translateX: slide }] },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.headerText}>{t('weekDrawer.title')}</Text>
          </View>

          <View style={styles.tabs}>
            {tab('midweek', t('weekDrawer.midweek'))}
            {tab('weekend', t('weekDrawer.weekend'))}
          </View>

          {weeksQuery.isLoading ? (
            <Text style={styles.empty}>{t('common.loading')}</Text>
          ) : !currentEntry && groups.length === 0 ? (
            <Text style={styles.empty}>{t('weekDrawer.empty')}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {currentEntry ? (
                <View>
                  <Text style={[styles.monthLabel, styles.currentLabel]}>
                    {t('weekDrawer.thisWeek')}
                  </Text>
                  {renderEntry(currentEntry, true)}
                  {groups.length > 0 ? <View style={styles.divider} /> : null}
                </View>
              ) : null}
              {groups.map((g) => (
                <View key={g.key}>
                  <Text style={styles.monthLabel}>{g.label}</Text>
                  {g.entries.map((e) => renderEntry(e, false))}
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* Collar / pull tab — closes the drawer */}
        <Animated.View
          style={[
            styles.collar,
            { top: height / 2 - 28, transform: [{ translateX: slide }] },
          ]}
        >
          <Pressable style={styles.collarBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color="#64748b" />
          </Pressable>
        </Animated.View>

        {/* Tap outside to close */}
        <Pressable style={styles.backdrop} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    left: PANEL_WIDTH,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PANEL_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
    zIndex: 2,
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  headerText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 10,
    marginTop: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 12.5, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#0e7490' },
  empty: { fontSize: 13, color: '#94a3b8', padding: 16 },
  monthLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'capitalize',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  currentLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#185FA5',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  divider: {
    height: 0.5,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rowCurrent: {
    backgroundColor: '#E6F1FB',
    borderWidth: 0.5,
    borderColor: '#B5D4F4',
  },
  dateBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBoxMidweek: { backgroundColor: '#ecfeff' },
  dateBoxWeekend: { backgroundColor: '#f5f3ff' },
  textMidweek: { color: '#0e7490' },
  textWeekend: { color: '#6d28d9' },
  dateDow: {
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  dateDay: { fontSize: 12, fontWeight: '800', lineHeight: 14 },
  rowMain: { flex: 1, minWidth: 0 },
  rowDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  rowDateCurrent: { color: '#0C447C' },
  rowWeek: { fontSize: 10.5, color: '#94a3b8', marginTop: 1 },
  dots: { flexDirection: 'row', alignItems: 'center', marginLeft: -2 },
  coBadge: {
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  coBadgeText: { fontSize: 9.5, fontWeight: '700', color: '#0e7490' },
  collar: {
    position: 'absolute',
    left: PANEL_WIDTH,
    width: 20,
    height: 56,
    zIndex: 3,
  },
  collarBtn: {
    width: 20,
    height: 56,
    backgroundColor: '#fff',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 0.5,
    borderLeftWidth: 0,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
