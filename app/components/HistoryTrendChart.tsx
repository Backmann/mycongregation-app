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
}

const CHART_HEIGHT = 130;
const DOT = 8;

/**
 * Combined trend: bible studies as bars, hours as a dotted line (dots joined by
 * thin segments). Pure Views — no chart dependency, works on web and native.
 * Oldest → newest, left to right.
 */
export function HistoryTrendChart({ points }: Props) {
  const { t } = useTranslation();

  const { maxHours, maxStudies, hasHours } = useMemo(() => {
    let mh = 0;
    let ms = 0;
    let any = false;
    for (const p of points) {
      if (p.hours != null) {
        any = true;
        if (p.hours > mh) mh = p.hours;
      }
      if (p.studies > ms) ms = p.studies;
    }
    return { maxHours: mh || 1, maxStudies: ms || 1, hasHours: any };
  }, [points]);

  if (points.length === 0) return null;

  const hoursTop = (h: number | null) =>
    h == null ? null : CHART_HEIGHT - (h / maxHours) * CHART_HEIGHT * 0.9;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('reports.publisherHistory.trendTitle')}</Text>

      <View style={styles.legend}>
        {hasHours ? (
          <View style={styles.legendItem}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>
              {t('reports.publisherHistory.hours')}
            </Text>
          </View>
        ) : null}
        <View style={styles.legendItem}>
          <View style={styles.legendBar} />
          <Text style={styles.legendText}>
            {t('reports.publisherHistory.studies')}
          </Text>
        </View>
      </View>

      <View style={styles.chart}>
        {points.map((p, i) => {
          const barH = Math.max(
            2,
            (p.studies / maxStudies) * CHART_HEIGHT * 0.85,
          );
          const dotTop = hoursTop(p.hours);
          return (
            <View key={i} style={styles.col}>
              {/* studies bar */}
              <View style={[styles.bar, { height: barH }]} />
              {/* hours dot with value */}
              {dotTop != null ? (
                <View
                  style={[styles.dotWrap, { top: dotTop - DOT / 2 - 14 }]}
                  pointerEvents="none"
                >
                  <Text style={styles.dotValue}>{p.hours}</Text>
                  <View style={styles.dot} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.labels}>
        {points.map((p, i) => (
          <Text key={i} style={styles.monthLabel} numberOfLines={1}>
            {p.monthLabel}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 12,
  },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: {
    width: 10,
    height: 10,
    backgroundColor: '#185FA5',
    borderRadius: 5,
  },
  legendBar: {
    width: 10,
    height: 10,
    backgroundColor: '#9FE1CB',
    borderRadius: 2,
  },
  legendText: { fontSize: 12, color: '#64748b' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 4,
  },
  col: {
    flex: 1,
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
  },
  bar: {
    width: '55%',
    backgroundColor: '#9FE1CB',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  dotWrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  dotValue: {
    fontSize: 10,
    color: '#185FA5',
    fontWeight: '600',
    marginBottom: 1,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: '#185FA5',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  labels: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    marginTop: 6,
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
  },
});
