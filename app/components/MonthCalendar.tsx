import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

/** Local date helpers working in YYYY-MM-DD (string-comparable, no tz drift). */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
/** Monday-based weekday index: Mon=0 … Sun=6. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

interface Preset {
  key: string;
  label: string;
  start: string;
  end: string | null;
}

interface Props {
  /** Tighter cells and centered max width — for space-constrained forms. */
  compact?: boolean;
  mode: 'single' | 'range';
  start: string | null;
  end: string | null;
  onChange: (v: { start: string | null; end: string | null }) => void;
  locale: string;
  /**
   * The caller decides what a tap means (the event form: a tap on any day of
   * a week picks the visit's whole week). `start`–`end` is still what is
   * drawn; `onChange` is not called for taps.
   */
  onPickDay?: (iso: string) => void;
  /** No «today / this weekend» shortcuts — where they would not fit. */
  hidePresets?: boolean;
  /**
   * The earliest day that can be picked (ISO). Days before it are drawn
   * faded and do nothing when tapped — a new field-service meeting cannot be
   * put on a day already gone (the server refuses it, 9 October 2026), and a
   * calendar that lets the tap through only to be refused on «Сохранить»
   * teaches nothing.
   */
  minDate?: string;
}

export function MonthCalendar({
  mode,
  start,
  end,
  onChange,
  locale,
  compact,
  onPickDay,
  hidePresets,
  minDate,
}: Props) {
  const { t } = useTranslation();
  const todayISO = toISO(new Date());
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = start ? fromISO(start) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const weekdays = useMemo(() => {
    const ref = new Date(2024, 0, 1); // Monday, 1 Jan 2024
    return Array.from({ length: 7 }, (_, i) =>
      addDays(ref, i).toLocaleDateString(locale, { weekday: 'short' }),
    );
  }, [locale]);

  // Only the first letter up: CSS «capitalize» raised every word, and the
  // Russian «2026 г.» came out «2026 Г.» (28 September).
  const monthRaw = viewMonth.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
  const monthLabel = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);

  const cells = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = addDays(first, -mondayIndex(first));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  const presets = useMemo<Preset[]>(() => {
    const now = new Date();
    const sat = addDays(now, (5 - mondayIndex(now) + 7) % 7); // upcoming Saturday
    const sun = addDays(sat, 1);
    const nextMon = addDays(now, 7 - mondayIndex(now)); // next Monday
    const nextSun = addDays(nextMon, 6);
    if (mode === 'single') {
      return [
        { key: 'today', label: t('calendar.today'), start: toISO(now), end: null },
        {
          key: 'tomorrow',
          label: t('calendar.tomorrow'),
          start: toISO(addDays(now, 1)),
          end: null,
        },
      ];
    }
    return [
      { key: 'weekend', label: t('calendar.weekend'), start: toISO(sat), end: toISO(sun) },
      {
        key: 'nextWeek',
        label: t('calendar.nextWeek'),
        start: toISO(nextMon),
        end: toISO(nextSun),
      },
    ];
  }, [mode, t]);
  // A shortcut to a day that cannot be picked would be a button that fails.
  const shownPresets = minDate
    ? presets.filter((p) => p.start >= minDate)
    : presets;
  const tooEarly = (iso: string) => !!minDate && iso < minDate;

  const isStart = (iso: string) => start === iso;
  const isEnd = (iso: string) => mode === 'range' && end === iso;
  const inRange = (iso: string) =>
    mode === 'range' && !!start && !!end && iso > start && iso < end;

  const pick = (iso: string) => {
    if (onPickDay) {
      onPickDay(iso);
      return;
    }
    if (mode === 'single') {
      onChange({ start: iso, end: null });
      return;
    }
    if (!start || (start && end)) {
      onChange({ start: iso, end: null });
    } else if (iso < start) {
      onChange({ start: iso, end: null });
    } else {
      onChange({ start, end: iso });
    }
  };

  const applyPreset = (p: Preset) => {
    setViewMonth(
      new Date(fromISO(p.start).getFullYear(), fromISO(p.start).getMonth(), 1),
    );
    onChange({ start: p.start, end: mode === 'range' ? p.end : null });
  };

  const goMonth = (delta: number) =>
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1),
    );

  return (
    <View style={compact ? styles.compactWrap : undefined}>
      {/* Presets */}
      {hidePresets ? null : (
      <View style={styles.presetRow}>
        {shownPresets.map((p) => (
          <Pressable
            key={p.key}
            style={styles.presetChip}
            onPress={() => applyPreset(p)}
          >
            <Text style={styles.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => goMonth(-1)} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color="#0369a1" />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={() => goMonth(1)} hitSlop={8} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color="#0369a1" />
        </Pressable>
      </View>

      {/* Weekday row */}
      <View style={styles.weekRow}>
        {weekdays.map((w, i) => (
          <View key={i} style={styles.cell}>
            <Text style={styles.weekday}>{w}</Text>
          </View>
        ))}
      </View>

      {/* Day grid — six rows of seven, each row its own line. It used to be
          42 cells in one wrapping row, each 1/7 wide: on Android the widths
          round to whole pixels, seven came out a hair wider than the row,
          and the seventh fell to the next line — every date then sat under
          the wrong weekday (27 September, a Sunday, under «Thu»). A row of
          seven equal shares cannot wrap. */}
      {Array.from({ length: 6 }, (_, w) => (
        <View key={w} style={styles.weekRow}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            const iso = toISO(d);
            const otherMonth = d.getMonth() !== viewMonth.getMonth();
            const selected = isStart(iso) || isEnd(iso);
            const between = inRange(iso);
            const isToday = iso === todayISO;
            const off = tooEarly(iso);
            return (
              <Pressable
                key={i}
                style={[styles.cell, between && styles.cellBetween]}
                onPress={off ? undefined : () => pick(iso)}
                disabled={off}
                accessibilityState={{ disabled: off, selected }}
              >
                <View style={[styles.dayInner, selected && styles.daySelected]}>
                  <Text
                    style={[
                      styles.dayText,
                      (otherMonth || off) && styles.dayOther,
                      isToday && !selected && styles.dayToday,
                      selected && styles.daySelectedText,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: { maxWidth: 320, alignSelf: 'center', width: '100%' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  presetChip: {
    backgroundColor: '#e0f2fe',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  presetText: { fontSize: 12, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: { padding: 4 },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  weekRow: { flexDirection: 'row' },
  // An equal share of its row, not a percentage: shares always add up.
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellBetween: { backgroundColor: '#e0f2fe' },
  weekday: { fontSize: 11, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#94a3b8' },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: '#0ea5e9' },
  dayText: { fontSize: 14, color: '#0f172a' },
  dayOther: { color: '#cbd5e1' },
  dayToday: { color: '#0ea5e9', fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  daySelectedText: { color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold',},
});
