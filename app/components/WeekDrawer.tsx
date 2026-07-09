import { useEffect, useMemo, useRef } from 'react';
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
import { assignmentsApi } from '../lib/api';
import { isSameWeek, startOfWeekMonday } from '../lib/dates';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentWeekStart: Date;
  onPick: (weekStart: Date) => void;
}

const PANEL_WIDTH = 250;

interface WeekRow {
  weekStartDate: string;
  hasMidweek: boolean;
  hasWeekend: boolean;
}

export function WeekDrawer({
  visible,
  onClose,
  currentWeekStart,
  onPick,
}: Props) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const slide = useRef(new Animated.Value(-PANEL_WIDTH)).current;

  const weeksQuery = useQuery({
    queryKey: ['assignments', 'published-weeks'],
    queryFn: () => assignmentsApi.publishedWeeks(),
    enabled: visible,
  });

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -PANEL_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  // Split out the current week (shown in its own section on top); group the
  // rest by "Month YYYY" preserving the newest-first order.
  const { currentRow, groups } = useMemo(() => {
    const rows = weeksQuery.data ?? [];
    let current: WeekRow | null = null;
    const out: { key: string; label: string; rows: WeekRow[] }[] = [];
    for (const r of rows) {
      if (isSameWeek(new Date(r.weekStartDate), currentWeekStart)) {
        current = r;
        continue;
      }
      const d = dayjs(r.weekStartDate).locale(i18n.language);
      const key = d.format('YYYY-MM');
      const label = d.format('MMMM YYYY');
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label, rows: [] };
        out.push(g);
      }
      g.rows.push(r);
    }
    return { currentRow: current, groups: out };
  }, [weeksQuery.data, i18n.language, currentWeekStart]);

  const fmtRange = (weekStartIso: string) => {
    const start = dayjs(weekStartIso).locale(i18n.language);
    const end = start.add(6, 'day');
    if (start.month() === end.month()) {
      return `${start.date()}–${end.date()} ${start.format('MMMM')}`;
    }
    return `${start.format('D MMM')} – ${end.format('D MMM')}`;
  };

  const midweekLabel = (weekStartIso: string) =>
    dayjs(weekStartIso).locale(i18n.language).add(2, 'day').format('dd, D');
  const weekendLabel = (weekStartIso: string) =>
    dayjs(weekStartIso).locale(i18n.language).add(6, 'day').format('dd, D');

  const renderWeek = (r: WeekRow, isCurrent: boolean) => {
    const rowDate = new Date(r.weekStartDate);
    return (
      <Pressable
        key={r.weekStartDate}
        style={[styles.week, isCurrent && styles.weekCurrent]}
        onPress={() => {
          onPick(startOfWeekMonday(rowDate));
          onClose();
        }}
      >
        <Text style={[styles.weekRange, isCurrent && styles.weekRangeCurrent]}>
          {fmtRange(r.weekStartDate)}
        </Text>
        <View style={styles.dates}>
          {r.hasMidweek ? (
            <View style={styles.dateChip}>
              <Ionicons
                name="calendar-outline"
                size={12}
                color={isCurrent ? '#185FA5' : '#94a3b8'}
              />
              <Text
                style={[styles.dateText, isCurrent && styles.dateTextCurrent]}
              >
                {midweekLabel(r.weekStartDate)}
              </Text>
            </View>
          ) : null}
          {r.hasWeekend ? (
            <View style={styles.dateChip}>
              <Ionicons
                name="calendar-number-outline"
                size={12}
                color={isCurrent ? '#185FA5' : '#94a3b8'}
              />
              <Text
                style={[styles.dateText, isCurrent && styles.dateTextCurrent]}
              >
                {weekendLabel(r.weekStartDate)}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

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

          {weeksQuery.isLoading ? (
            <Text style={styles.empty}>{t('common.loading')}</Text>
          ) : !currentRow && groups.length === 0 ? (
            <Text style={styles.empty}>{t('weekDrawer.empty')}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {currentRow ? (
                <View>
                  <Text style={[styles.monthLabel, styles.currentLabel]}>
                    {t('weekDrawer.thisWeek')}
                  </Text>
                  {renderWeek(currentRow, true)}
                  {groups.length > 0 ? <View style={styles.divider} /> : null}
                </View>
              ) : null}
              {groups.map((g) => (
                <View key={g.key}>
                  <Text style={styles.monthLabel}>{g.label}</Text>
                  {g.rows.map((r) => renderWeek(r, false))}
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
  empty: { fontSize: 13, color: '#94a3b8', padding: 16 },
  monthLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  currentLabel: { color: '#185FA5' },
  divider: {
    height: 0.5,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
  },
  week: {
    marginHorizontal: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 10,
  },
  weekCurrent: {
    backgroundColor: '#E6F1FB',
    borderWidth: 0.5,
    borderColor: '#B5D4F4',
  },
  weekRange: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 5,
  },
  weekRangeCurrent: { color: '#0C447C' },
  dates: { flexDirection: 'row', gap: 14 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 12, color: '#64748b', textTransform: 'capitalize' },
  dateTextCurrent: { color: '#185FA5' },
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
