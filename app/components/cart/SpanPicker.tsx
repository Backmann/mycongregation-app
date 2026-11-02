import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CartSpan } from '../../lib/api';
import { MIN_SPAN, STEP, toHHMM, toMin } from '../../lib/cart-time';

/**
 * «С какого времени» and «сколько» (2 November 2026): the start on the
 * half-hour, the length an hour or more — as people say it, not as cells.
 * Only what fits inside the day is offered.
 */
const LENGTHS = [60, 90, 120, 180];

export function SpanPicker({
  day,
  value,
  onChange,
  notBefore,
  lengths: offered = LENGTHS,
  blocked = [],
}: {
  day: CartSpan;
  value: CartSpan | null;
  onChange: (span: CartSpan) => void;
  /** «HH:MM»: no start before it (today, the time already gone). */
  notBefore?: string | null;
  /** The lengths to offer, in minutes; the day's own hours need longer ones. */
  lengths?: number[];
  /** Called-off parts: no time that touches them is offered. */
  blocked?: CartSpan[];
}) {
  const { t } = useTranslation();
  const from = toMin(day.startTime);
  const to = toMin(day.endTime);
  const floor = notBefore ? Math.max(from, toMin(notBefore)) : from;
  const starts: number[] = [];
  const free = (a: number, b: number) =>
    !blocked.some((o) => a < toMin(o.endTime) && toMin(o.startTime) < b);
  for (let m = from; m + MIN_SPAN <= to; m += STEP) if (m >= floor && free(m, m + MIN_SPAN)) starts.push(m);
  const start = value ? toMin(value.startTime) : null;
  const len = value ? toMin(value.endTime) - toMin(value.startTime) : null;
  const lengths = offered.filter((l) => start === null || (start + l <= to && free(start, start + l)));

  const pick = (s: number, l: number) =>
    onChange({ startTime: toHHMM(s), endTime: toHHMM(Math.min(s + l, to)) });

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{t('witnessing.fromWhen')}</Text>
      <View style={styles.grid}>
        {starts.map((m) => {
          const on = start === m;
          const inside = start !== null && len !== null && m > start && m < start + len;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                const want = len && m + len <= to && free(m, m + len) ? len : Math.min(120, to - m);
                pick(m, free(m, m + want) ? want : MIN_SPAN);
              }}
              style={[styles.chip, inside && styles.chipInside, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, inside && styles.chipTextInside, on && styles.chipTextOn]}>
                {toHHMM(m)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {start !== null && (
        <>
          <Text style={styles.label}>{t('witnessing.howLong')}</Text>
          <View style={styles.row}>
            {lengths.map((l) => {
              const on = len === l;
              return (
                <Pressable
                  key={l}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => pick(start, l)}
                  style={[styles.len, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {LENGTHS.includes(l) ? t(`witnessing.length.${l}`) : t('witnessing.hoursN', { count: l / 60 })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#475569' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    minWidth: 58,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  len: {
    flexGrow: 1,
    minWidth: 64,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  chipInside: { backgroundColor: '#bbf7d0', borderColor: '#bbf7d0' },
  chipOn: { backgroundColor: '#15803d', borderColor: '#15803d' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#334155' },
  chipTextInside: { color: '#14532d' },
  chipTextOn: { color: '#ffffff' },
});
