import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ConductRunSegment } from '../lib/api';
import { partDisplay } from '../lib/part-display';

/**
 * HOW THE MEETING RAN — who had how much time (14 October 2026).
 *
 * Lionel wanted the chairman to be able to look back after «Завершить» and
 * see it part by part. One table, the same for the run just finished on this
 * device and for the one read from the server by an elder later in the week.
 *
 * A student is measured against the programme's OWN minutes — four for a
 * four-minute reading, not five: the fifth is the chairman's counsel, and it
 * stands in a line of its own under him. «Время заданий должно быть именно
 * столько, сколько оно зафиксировано в программе.»
 *
 * Over or under by less than TOLERANCE reads as on time: nobody stops a
 * reading at exactly 4:00, and a table of red +0:03s would teach the eye to
 * ignore the colour.
 */
const TOLERANCE_SEC = 10;

/**
 * The opening and the closing are segments of SEVERAL things — song, prayer
 * and the chairman's words — carried on the prayer's row (lib/run-order.ts).
 * Put under the brother who prays, six minutes would read as his; they are
 * named for what they are and stand under nobody.
 */
const BLOCK_LABEL: Record<string, string> = {
  midweek_opening_prayer: 'conduct.result.opening',
  midweek_closing_prayer: 'conduct.result.closing',
};

export interface ConductSummaryData {
  segments: ConductRunSegment[];
  totalSec: number;
  plannedSec: number;
}

export function ConductSummary({
  data,
  titleOf,
  nameOf,
  chairmanName,
}: {
  data: ConductSummaryData;
  /** The programme row's title, for the part's label. */
  titleOf: (assignmentId: string | null) => string | null;
  nameOf: (publisherId: string) => string | null;
  chairmanName: string | null;
}) {
  const { t } = useTranslation();
  const counsel = data.segments.filter((s) => s.counselSec !== null);
  const counselActual = counsel.reduce((sum, s) => sum + (s.counselSec ?? 0), 0);
  const counselPlanned = counsel.length * 60;
  // What no part holds: pauses and the moments between parts. Without this
  // line the meeting's total would not add up to its rows.
  const inParts = data.segments.reduce((sum, s) => sum + s.actualSec + (s.counselSec ?? 0), 0);
  const between = data.totalSec - inParts;

  return (
    <View style={styles.card}>
      <View style={styles.totalRow}>
        <Text style={styles.total}>{t('conduct.result.took', { time: clock(data.totalSec) })}</Text>
        <Diff sec={data.totalSec - data.plannedSec} big />
      </View>
      <Text style={styles.plannedLine}>{t('conduct.result.planned', { time: clock(data.plannedSec) })}</Text>

      <View style={styles.headRow}>
        <Text style={[styles.head, styles.colPart]}>{t('conduct.result.part')}</Text>
        <Text style={[styles.head, styles.colNum]}>{t('conduct.result.plan')}</Text>
        <Text style={[styles.head, styles.colNum]}>{t('conduct.result.fact')}</Text>
        <Text style={[styles.head, styles.colDiffHead]}>±</Text>
      </View>
      {data.segments.map((s, i) => {
        const block = BLOCK_LABEL[s.key];
        const d = block ? { label: t(block) } : partDisplay(s.key, titleOf(s.assignmentId));
        const people = block ? [] : s.publisherIds.map(nameOf).filter((n): n is string => !!n);
        return (
          <View key={`${s.key}-${i}`} style={styles.row}>
            <View style={styles.colPart}>
              <Text style={styles.label} numberOfLines={2}>{d.label}</Text>
              {people.length ? <Text style={styles.person}>{people.join(' · ')}</Text> : null}
            </View>
            <Text style={[styles.num, styles.colNum]}>{mmss(s.plannedSec)}</Text>
            <Text style={[styles.num, styles.colNum]}>{mmss(s.actualSec)}</Text>
            <View style={styles.colDiff}>
              <Diff sec={s.actualSec - s.plannedSec} />
            </View>
          </View>
        );
      })}

      {counsel.length ? (
        <>
          <Text style={styles.section}>
            {chairmanName
              ? t('conduct.result.chairmanNamed', { name: chairmanName })
              : t('conduct.result.chairman')}
          </Text>
          <View style={styles.row}>
            <View style={styles.colPart}>
              <Text style={styles.label}>{t('conduct.result.counsel', { n: counsel.length })}</Text>
            </View>
            <Text style={[styles.num, styles.colNum]}>{mmss(counselPlanned)}</Text>
            <Text style={[styles.num, styles.colNum]}>{mmss(counselActual)}</Text>
            <View style={styles.colDiff}>
              <Diff sec={counselActual - counselPlanned} />
            </View>
          </View>
        </>
      ) : null}

      {between >= TOLERANCE_SEC ? (
        <View style={[styles.row, styles.rowLast]}>
          <View style={styles.colPart}>
            <Text style={styles.label}>{t('conduct.result.between')}</Text>
          </View>
          <Text style={[styles.num, styles.colNum]}>—</Text>
          <Text style={[styles.num, styles.colNum]}>{mmss(between)}</Text>
          <View style={styles.colDiff}>
            <Diff sec={between} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Diff({ sec, big }: { sec: number; big?: boolean }) {
  const s = Math.round(sec);
  const style =
    Math.abs(s) < TOLERANCE_SEC ? styles.diffOk : s > 0 ? styles.diffOver : styles.diffUnder;
  const text = Math.abs(s) < TOLERANCE_SEC ? '0:00' : `${s > 0 ? '+' : '−'}${mmss(Math.abs(s))}`;
  return <Text style={[big ? styles.diffBig : styles.diff, style]}>{text}</Text>;
}

/** m:ss */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** h:mm:ss for an hour or more, m:ss below. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) return mmss(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  total: { fontFamily: 'Manrope_700Bold', fontSize: 18, color: '#0f172a', flexShrink: 1 },
  plannedLine: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 12 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  head: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  colPart: { flex: 1, minWidth: 0, paddingRight: 8 },
  colNum: { width: 50, textAlign: 'right' },
  colDiff: { width: 62, alignItems: 'flex-end' },
  colDiffHead: { width: 62, textAlign: 'right' },
  rowLast: { borderBottomWidth: 0 },
  label: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 19, color: '#0f172a' },
  person: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, lineHeight: 17, color: '#475569', marginTop: 1 },
  num: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, lineHeight: 19, color: '#334155', fontVariant: ['tabular-nums'] },
  diff: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, lineHeight: 19, fontVariant: ['tabular-nums'] },
  diffBig: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, fontVariant: ['tabular-nums'] },
  diffOk: { color: '#64748b' },
  diffOver: { color: '#b91c1c' },
  diffUnder: { color: '#15803d' },
  section: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#0f172a', marginTop: 16, marginBottom: 2 },
});
