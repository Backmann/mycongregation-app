import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';

/** YYYY-MM-DD helpers (string-comparable, no timezone drift). */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}
/** Monday-based weekday of the 1st: Mon=0 … Sun=6. */
function firstWeekday(year: number, month0: number): number {
  return (new Date(year, month0, 1).getDay() + 6) % 7;
}

/**
 * Month and weekday names come from the reader's own language.
 *
 * They used to be two Russian arrays in this file — and this picker opens
 * from every date on every screen, so a German or English reader met a Russian
 * calendar everywhere. The i18n check could not catch it either: it watches
 * for missing KEYS, and there was no key to miss.
 *
 * Built from dayjs rather than from new translation keys: the names are
 * already in its locales, correct and declined, and one more list of twelve
 * words in three files is one more list to keep in step.
 */
/** A Monday, so the seven labels come out Monday-first. */
const WEEK_ANCHOR = '2024-01-01';

function monthNames(locale: string): string[] {
  return Array.from({ length: 12 }, (_, m) =>
    dayjs().locale(locale).month(m).date(1).format('MMMM'),
  );
}

function weekdayNames(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    dayjs(WEEK_ANCHOR).add(i, 'day').locale(locale).format('dd'),
  );
}

export function DateField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string | undefined; // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const months = useMemo(() => monthNames(i18n.language), [i18n.language]);
  const weekdays = useMemo(() => weekdayNames(i18n.language), [i18n.language]);

  const now = useMemo(() => new Date(), []);
  const parsed = useMemo(() => {
    const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
    if (!m) return null;
    return {
      year: parseInt(m[1], 10),
      month0: parseInt(m[2], 10) - 1,
      day: parseInt(m[3], 10),
    };
  }, [value]);

  // View state (the month currently shown in the calendar).
  const [viewYear, setViewYear] = useState(parsed?.year ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month0 ?? now.getMonth());

  const years = useMemo(() => {
    const end = now.getFullYear() + 1;
    const start = end - 100;
    const arr: number[] = [];
    for (let y = end; y >= start; y--) arr.push(y);
    return arr;
  }, [now]);

  const openPicker = () => {
    setViewYear(parsed?.year ?? now.getFullYear());
    setViewMonth(parsed?.month0 ?? now.getMonth());
    setOpen(true);
  };

  const pick = (day: number) => {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`);
    setOpen(false);
  };

  const grid = useMemo(() => {
    const lead = firstWeekday(viewYear, viewMonth);
    const count = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= count; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const [yearOpen, setYearOpen] = useState(false);

  const isToday = (d: number) =>
    viewYear === now.getFullYear() &&
    viewMonth === now.getMonth() &&
    d === now.getDate();
  const isSelected = (d: number) =>
    parsed != null &&
    parsed.year === viewYear &&
    parsed.month0 === viewMonth &&
    parsed.day === d;

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.field} onPress={openPicker}>
        <Ionicons name="calendar-outline" size={17} color="#0369a1" />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || placeholder || t('common.datePlaceholder')}
        </Text>
        {value ? (
          <Pressable hitSlop={8} onPress={() => onChange('')}>
            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color="#94a3b8" />
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            {/* Header: month nav + year selector */}
            <View style={styles.headerRow}>
              <Pressable
                style={styles.navBtn}
                onPress={prevMonth}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={20} color="#0369a1" />
              </Pressable>
              <Pressable
                style={styles.monthYear}
                onPress={() => setYearOpen((v) => !v)}
              >
                <Text style={styles.monthYearText}>
                  {months[viewMonth]} {viewYear}
                </Text>
                <Ionicons
                  name={yearOpen ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color="#64748b"
                />
              </Pressable>
              <Pressable
                style={styles.navBtn}
                onPress={nextMonth}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={20} color="#0369a1" />
              </Pressable>
            </View>

            {yearOpen ? (
              <ScrollView style={styles.yearList}>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    style={[
                      styles.yearRow,
                      y === viewYear && styles.yearRowActive,
                    ]}
                    onPress={() => {
                      setViewYear(y);
                      setYearOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.yearText,
                        y === viewYear && styles.yearTextActive,
                      ]}
                    >
                      {y}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {weekdays.map((w) => (
                    <Text key={w} style={styles.weekday}>
                      {w}
                    </Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {grid.map((d, i) => (
                    <View key={i} style={styles.cell}>
                      {d != null ? (
                        <Pressable
                          style={[
                            styles.day,
                            isSelected(d) && styles.daySelected,
                          ]}
                          onPress={() => pick(d)}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              isToday(d) && styles.dayToday,
                              isSelected(d) && styles.dayTextSelected,
                            ]}
                          >
                            {d}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.day} />
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={styles.footer}>
              <Pressable
                onPress={() => {
                  onChange(
                    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
                      now.getDate(),
                    )}`,
                  );
                  setOpen(false);
                }}
              >
                <Text style={styles.footerToday}>{t('common.today')}</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.footerClose}>{t('common.done')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 6,
    fontWeight: '600',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  value: { flex: 1, fontSize: 15, color: '#0f172a' },
  placeholder: { color: '#94a3b8' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'center',
    padding: 28,
  },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  monthYear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  // dayjs gives month names in lower case in Russian ("август"); the header
  // read as a capital before, so it keeps reading as one.
  monthYearText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  yearList: { maxHeight: 260 },
  yearRow: { paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  yearRowActive: { backgroundColor: '#e0f2fe' },
  yearText: { fontSize: 16, color: '#0f172a' },
  yearTextActive: { color: '#0369a1', fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: '#0ea5e9' },
  dayText: { fontSize: 14, color: '#0f172a' },
  dayToday: { color: '#0ea5e9', fontWeight: '700' },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
  },
  footerToday: { color: '#0369a1', fontSize: 14, fontWeight: '600' },
  footerClose: { color: '#64748b', fontSize: 14, fontWeight: '600' },
});
