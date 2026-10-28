import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface TrendPoint {
  monthLabel: string;
  hours: number | null;
  studies: number;
}

interface Props {
  points: TrendPoint[];
  /** A dashed line at this many hours — the monthly pace of a pioneer. */
  paceLine?: number | null;
}

const CHART_HEIGHT = 130;

/**
 * Twelve months at a glance. Pure Views — no chart dependency, web and native.
 * Oldest → newest, left to right.
 *
 * ONE scale per chart (28 October 2026). Hours and studies used to share the
 * height — two studies drew a bar as tall as forty-six hours, and the eye
 * read them as the same size. Now: where there are hours, the bars are hours
 * (with the pace as a dashed line) and the studies stand as a row of figures
 * under the months; a publisher without hours gets his studies as the bars.
 */
export function HistoryTrendChart({ points, paceLine }: Props) {
  const { t } = useTranslation();

  const { max, hasHours } = useMemo(() => {
    const anyHours = points.some((p) => p.hours != null);
    let m = 0;
    for (const p of points) {
      const v = anyHours ? (p.hours ?? 0) : p.studies;
      if (v > m) m = v;
    }
    if (anyHours && paceLine) m = Math.max(m, paceLine);
    return { max: m || 1, hasHours: anyHours };
  }, [points, paceLine]);

  if (points.length === 0) return null;
  const valueOf = (p: TrendPoint) => (hasHours ? p.hours : p.studies);
  const heightOf = (v: number) => (v / max) * CHART_HEIGHT * 0.86;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {hasHours
            ? t('reports.publisherHistory.trendHours')
            : t('reports.publisherHistory.trendStudies')}
        </Text>
        {/* The pace line is named up here: written on the line itself it sat
            on top of the bars' own figures. */}
        {hasHours && paceLine ? (
          <View style={styles.legend}>
            <View style={styles.legendDash} />
            <Text style={styles.legendText}>{t('reports.publisherHistory.paceLine', { n: paceLine })}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.plot}>
        {hasHours && paceLine ? (
          <View style={[styles.pace, { bottom: heightOf(paceLine) }]} />
        ) : null}
        {points.map((p, i) => {
          const v = valueOf(p);
          return (
            <View key={i} style={styles.col}>
              {v != null ? <Text style={styles.value}>{v}</Text> : null}
              <View style={[styles.bar, { height: v ? Math.max(3, heightOf(v)) : 3 }, !v && styles.barNone]} />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        {points.map((p, i) => (
          <Text key={i} style={styles.axisText}>
            {p.monthLabel}
          </Text>
        ))}
      </View>
      {hasHours ? (
        <>
          <View style={styles.axis}>
            {points.map((p, i) => (
              <Text key={i} style={styles.studies}>
                {p.studies}
              </Text>
            ))}
          </View>
          <Text style={styles.studiesLabel}>{t('reports.publisherHistory.studiesRow')}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
  },
  title: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  plot: {
    height: CHART_HEIGHT + 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 10,
    position: 'relative',
  },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  value: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    color: '#334155',
    marginBottom: 3,
    fontVariant: ['tabular-nums'],
  },
  bar: { width: '100%', maxWidth: 34, backgroundColor: '#0e7490', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barNone: { backgroundColor: '#e2e8f0' },
  pace: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDash: { width: 18, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: '#94a3b8' },
  legendText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#64748b' },
  axis: { flexDirection: 'row', gap: 6, marginTop: 6 },
  axisText: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_600SemiBold', fontSize: 9.5, color: '#94a3b8' },
  studies: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    color: '#0f766e',
    fontVariant: ['tabular-nums'],
  },
  studiesLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
    color: '#94a3b8',
    textAlign: 'right',
    marginTop: 2,
  },
});
