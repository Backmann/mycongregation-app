import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { MonthGrid } from './PioneerSpellSheet';
import { capitalize, monthName } from '../../lib/aux-application';
import { WIDE_FROM } from '../../lib/screen-width';
import { publishersApi, type PioneerType } from '../../lib/api';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 15));
  return d.toISOString().slice(0, 7);
}

/**
 * «Закончил пионерское служение» (30 October 2026) — the one way a pioneer's
 * service ends, from the card's form or its history: the last month he
 * served, what follows from it, and what has already gone to the branch and
 * will stay as it went.
 */
export function PioneerEndSheet({
  visible,
  publisherId,
  kind,
  since,
  thisMonth,
  onClose,
  onConfirm,
  busy,
}: {
  visible: boolean;
  /** Null for a card not yet saved — then nothing can have been sent. */
  publisherId: string | null;
  kind: PioneerType;
  /** The first month of the running spell, YYYY-MM. */
  since: string | null;
  thisMonth: string;
  onClose: () => void;
  onConfirm: (lastMonth: string) => void;
  busy?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { width } = useWindowDimensions();
  const previous = addMonth(thisMonth, -1);
  const [month, setMonth] = useState(previous);
  const [other, setOther] = useState(false);
  const [year, setYear] = useState(thisMonth.slice(0, 4));

  useEffect(() => {
    if (!visible) return;
    const first = since && previous < since ? thisMonth : previous;
    setMonth(first);
    setOther(false);
    setYear(first.slice(0, 4));
  }, [visible, since, thisMonth, previous]);

  const impactQ = useQuery({
    queryKey: ['pioneer-end-impact', publisherId, month],
    queryFn: () => publishersApi.pioneerEndImpact(publisherId!, month),
    enabled: visible && !!publisherId,
  });
  const impact = impactQ.data;
  const tooEarly = !!since && month < since;
  const name = (ym: string) => capitalize(monthName(ym, lang));
  const list = (months: string[]) => months.map((m) => monthName(m, lang)).join(', ');

  const chip = (ym: string) => (
    <Pressable
      key={ym}
      onPress={() => {
        setMonth(ym);
        setOther(false);
      }}
      style={[styles.chip, month === ym && !other && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: month === ym && !other }}
    >
      <Text style={[styles.chipText, month === ym && !other && styles.chipTextOn]}>{name(ym)}</Text>
    </Pressable>
  );
  const quick = [previous, thisMonth].filter((ym) => !since || ym >= since);

  return (
    <Sheet
      visible={visible}
      title={t('pioneerEnd.title')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= WIDE_FROM ? 'centered' : 'bottom'}
      footer={
        <Pressable
          style={[styles.btn, (tooEarly || busy) && { opacity: 0.45 }]}
          disabled={tooEarly || busy}
          onPress={() => onConfirm(month)}
          accessibilityRole="button"
          testID="pioneer-end-confirm"
        >
          <Text style={styles.btnText}>{t('pioneerEnd.confirm')}</Text>
        </Pressable>
      }
    >
      <View style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>{t('pioneerEnd.lastMonth')}</Text>
          <View style={styles.chips}>
            {quick.map(chip)}
            <Pressable
              onPress={() => setOther(true)}
              style={[styles.chip, other && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: other }}
            >
              <Text style={[styles.chipText, other && styles.chipTextOn]}>
                {other && !quick.includes(month) ? name(month) : t('pioneerEnd.other')}
              </Text>
            </Pressable>
          </View>
          {other ? (
            <MonthGrid
              year={year}
              onYear={setYear}
              thisMonth={thisMonth}
              isOn={(ym) => ym === month}
              onPick={setMonth}
            />
          ) : null}
          {tooEarly && since ? (
            <Text style={styles.error}>{t('pioneerEnd.beforeStart', { month: monthName(since, lang) })}</Text>
          ) : null}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxHead}>{t('pioneerEnd.whatChanges')}</Text>
          {[
            t('pioneerEnd.reports', { month: name(addMonth(month, 1)) }),
            kind === 'regular' ? t('pioneerEnd.s1') : t('pioneerEnd.s1Special'),
            t('pioneerEnd.year'),
            t('pioneerEnd.history', { kind: t(`publishers.pioneer.detail.${kind}`), month: monthName(month, lang) }),
          ].map((line) => (
            <View key={line} style={styles.line}>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.lineText}>{line}</Text>
            </View>
          ))}
        </View>

        {impactQ.isFetching ? <ActivityIndicator /> : null}
        {impact && impact.sentAsPioneer.length > 0 ? (
          <View style={styles.warn}>
            <Ionicons name="paper-plane-outline" size={16} color="#92400e" />
            <Text style={styles.warnText}>{t('pioneerEnd.sent', { months: list(impact.sentAsPioneer) })}</Text>
          </View>
        ) : null}
        {impact && impact.reportedHours.length > 0 ? (
          <View style={styles.warn}>
            <Ionicons name="time-outline" size={16} color="#92400e" />
            <Text style={styles.warnText}>{t('pioneerEnd.hours', { months: list(impact.reportedHours) })}</Text>
          </View>
        ) : null}
        <Text style={styles.hint}>{t('pioneerEnd.hint')}</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#334155' },
  chipTextOn: { color: '#fff', fontFamily: 'Manrope_800ExtraBold' },
  box: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 16, padding: 12, gap: 6 },
  boxHead: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.5,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  line: { flexDirection: 'row', gap: 8 },
  dot: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#166534' },
  lineText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 13.5, lineHeight: 19, color: '#334155' },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 10,
  },
  warnText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 18, color: '#92400e' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: MUTED },
  error: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: INK, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
});
