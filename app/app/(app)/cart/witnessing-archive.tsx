import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { cartWeeksApi } from '../../../lib/api';
import { addDays, formatDateISO, parseISODate } from '../../../lib/dates';
import { failsScreen } from '../../../lib/screen-failure';
import { archiveHtml } from '../../../lib/cart-plan';
import { exportHtmlAsPdf } from '../../../lib/pdf';
import { appFontFaces } from '../../../lib/print-fonts';
import { notify } from '../../../lib/error-bus';
import { formatDayRange } from '../../../lib/date-range';

/**
 * What the congregation really did at the stand (2 November 2026): only the
 * service that took place — the final plan, less what was called off; never
 * who declined. By default since the circuit overseer's last visit, so the
 * sheet for his next visit is one tap; half a year or a year on request.
 */
type Period = 'visit' | 'half' | 'year';

export default function WitnessingArchiveScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [period, setPeriod] = useState<Period>('visit');
  const today = new Date();
  const from =
    period === 'visit'
      ? undefined
      : formatDateISO(addDays(today, period === 'half' ? -182 : -365));

  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['cart-archive', period],
    queryFn: () => cartWeeksApi.archive(from),
  });
  const a = q.data;

  const cap = (s: string) => `${s.charAt(0).toLocaleUpperCase(locale)}${s.slice(1)}`;
  const dayLabel = (iso: string) =>
    cap(parseISODate(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }));
  const hours = (m: number) =>
    t('witnessing.hoursShort', { value: (Math.round((m / 60) * 10) / 10).toLocaleString(locale) });
  const periodText = a ? formatDayRange(a.from, a.to, locale, { month: 'long' }) : '';

  const pdf = async () => {
    if (!a) return;
    const html = archiveHtml(
      a,
      {
        title: `${t('service.publicWitnessing')} · ${t('witnessing.archiveTitle')}`,
        period: periodText,
        totals: t('witnessing.archiveTotals', {
          days: a.totals.days,
          hours: hours(a.totals.minutes),
          people: a.totals.people,
        }),
        byPlace: t('witnessing.archiveByPlace'),
        calledOff: t('witnessing.archiveCalledOff'),
        days: t('witnessing.archiveDays'),
        daysCol: t('witnessing.statDays'),
        hoursCol: t('witnessing.statHours'),
        dayLabel,
        hours,
      },
      appFontFaces(),
    );
    const r = await exportHtmlAsPdf(html, { fileName: t('witnessing.archivePdfName') });
    if (!r.ok && r.reason === 'popup_blocked') notify(t('witnessing.popupBlocked'));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        {(['visit', 'half', 'year'] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p }}
            onPress={() => setPeriod(p)}
            style={[styles.chip, period === p && styles.chipOn]}
          >
            <Text style={[styles.chipText, period === p && styles.chipTextOn]}>
              {t(`witnessing.period.${p}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {q.isLoading || !a ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#0e7490" />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.muted}>{periodText}</Text>
            <View style={styles.stats}>
              <Stat value={String(a.totals.days)} label={t('witnessing.statDays')} />
              <Stat value={hours(a.totals.minutes)} label={t('witnessing.statHours')} />
              <Stat value={String(a.totals.people)} label={t('witnessing.statPeople')} />
            </View>
            {a.totals.byPlace.map((p) => (
              <View key={p.place} style={styles.line}>
                <Text style={styles.lineName}>{p.place}</Text>
                <Text style={styles.lineValue}>
                  {t('witnessing.daysCount', { count: p.days })} · {hours(p.minutes)}
                </Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.primaryBtn} onPress={pdf} disabled={a.days.length === 0}>
            <Text style={styles.primaryBtnText}>{t('witnessing.archivePdf')}</Text>
          </Pressable>

          {a.totals.calledOff.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.h}>{t('witnessing.archiveCalledOff')}</Text>
              {a.totals.calledOff.map((c, i) => (
                <Text key={`${c.date}${c.place}${i}`} style={styles.small}>
                  {dayLabel(c.date)} · {c.place} · {c.startTime}–{c.endTime}
                  {c.reason ? ` · ${c.reason}` : ''}
                </Text>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.h}>{t('witnessing.archiveDays')}</Text>
            {a.days.length === 0 && <Text style={styles.muted}>{t('witnessing.archiveEmpty')}</Text>}
            {a.days.map((d, i) => (
              <View key={`${d.date}${d.place}${i}`} style={styles.day}>
                <View style={styles.line}>
                  <Text style={styles.lineName}>
                    {dayLabel(d.date)} · {d.place}
                  </Text>
                  <Text style={styles.lineValue}>{hours(d.minutes)}</Text>
                </View>
                {d.people.map((p, j) => (
                  <Text key={j} style={styles.small}>
                    {p.name} · {p.startTime}–{p.endTime}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 14, paddingBottom: 60, gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: '#0e7490', borderColor: '#0e7490' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#334155' },
  chipTextOn: { color: '#ffffff' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 12, gap: 6 },
  h: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  muted: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569' },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#334155' },
  stats: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  stat: { flex: 1, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#15803d' },
  statLabel: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#475569' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  lineName: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#0f172a' },
  lineValue: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569' },
  day: { gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  primaryBtn: { backgroundColor: '#15803d', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontSize: 15.5, fontFamily: 'Manrope_800ExtraBold' },
});
