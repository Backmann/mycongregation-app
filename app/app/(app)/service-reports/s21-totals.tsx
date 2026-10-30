import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { serviceReportsApi, type S21Totals } from '../../../lib/api';
import { LoadFailure } from '../../../components/LoadFailure';
import { usePermissions } from '../../../lib/permissions';
import { HEADER_ICON } from '../../../lib/header';
import { failsScreen } from '../../../lib/screen-failure';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { availableServiceYears } from '../../../lib/s21';
import {
  hasFigures,
  rowsOf,
  totalHours,
  TOTALS_CARDS,
  type TotalsCard,
} from '../../../lib/s21-totals';
import { buildS21TotalsHtml } from '../../../lib/s21TotalsPdf';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';

/** «сентябрь» — the month alone; its year stands above it once. */
function monthName(lang: string, month: string): string {
  return dayjs(`${month}-01`).locale(lang).format('MMMM');
}

/**
 * THE THREE TOTALS CARDS (S-21) — instruction, point 14 (30 October 2026).
 *
 * Besides each person's card the secretary keeps three with the
 * congregation's total for every month. They stand here as the months went
 * to the branch («план Б»): the figures kept when the month was sent, a late
 * report in the month that counted it — so the auxiliary and the publishers'
 * cards are the S-1's own lines and can be checked against JW Hub figure by
 * figure. The first card is the S-1's regular pioneers plus the special
 * pioneers and missionaries, who report to the branch themselves.
 */
export default function S21TotalsScreen() {
  const { t } = useTranslation();
  const { canViewServiceSummary } = usePermissions();
  const { width } = useWindowDimensions();
  const years = useMemo(() => availableServiceYears(), []);
  const [year, setYear] = useState<number | undefined>(undefined);

  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['service-reports', 's21-totals', year ?? 'current'],
    queryFn: () => serviceReportsApi.getS21Totals(year),
    enabled: canViewServiceSummary,
  });
  const data = q.data;
  const shownYear = data?.serviceYear ?? year ?? years[0];
  const yearLabel = (y: number) =>
    t('s21Totals.yearShort', { from: y - 1, to: y });
  // Side by side where three columns fit; one under another on a phone.
  const columns = width >= 1060 ? 3 : 1;

  const print = () => {
    if (!data) return;
    const preopened = openPrintWindow();
    void exportHtmlAsPdf(buildS21TotalsHtml(data, t), {
      fileName: `S-21 ${shownYear - 1}-${shownYear}`,
      preopenedWindow: preopened,
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('s21Totals.title'),
          headerRight: () =>
            data ? (
              <Pressable
                onPress={print}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
                accessibilityLabel={t('s21Totals.print')}
              >
                <Ionicons name="print-outline" size={22} color={HEADER_ICON} />
              </Pressable>
            ) : null,
        }}
      />
      <View style={styles.header}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.yearRow}
        >
          {years.map((y) => {
            const on = y === shownYear;
            return (
              <Pressable
                key={y}
                onPress={() => setYear(y)}
                style={[styles.yearChip, on && styles.yearChipOn]}
              >
                <Text style={[styles.yearChipText, on && styles.yearChipTextOn]}>
                  {yearLabel(y)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : q.error ? (
        <View style={styles.center}>
          <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />
          }
        >
          <Text style={styles.intro}>{t('s21Totals.intro')}</Text>
          <View style={[styles.cards, columns === 3 && styles.cardsRow]}>
            {TOTALS_CARDS.map((card) => (
              <TotalsCardView
                key={card.key}
                card={card}
                data={data}
                wide={columns === 3}
              />
            ))}
          </View>
          <View style={styles.legend}>
            <LegendItem dot="#0e7490" text={t('s21Totals.legend.sent')} />
            <LegendItem dot="#94a3b8" text={t('s21Totals.legend.frozen')} />
            <LegendItem dot="#f59e0b" text={t('s21Totals.legend.collecting')} />
            <LegendItem dot="#475569" text={t('s21Totals.legend.closed')} />
            <LegendItem dot="#e11d48" text={t('s21Totals.legend.open')} />
          </View>
          <Text style={styles.foot}>{t('s21Totals.lateHint')}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function LegendItem({ dot, text }: { dot: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const STATE_DOT: Record<string, string> = {
  sent: '#0e7490',
  frozen: '#94a3b8',
  collecting: '#f59e0b',
  closed: '#475569',
  open: '#e11d48',
};

function TotalsCardView({
  card,
  data,
  wide,
}: {
  card: TotalsCard;
  data: S21Totals;
  wide: boolean;
}) {
  const { t, i18n } = useTranslation();
  const rows = rowsOf(data, card);
  const hours = totalHours(rows);
  const any = rows.some((r) => hasFigures(r.state));
  return (
    <View style={[styles.card, wide && styles.cardWide]}>
      <View style={[styles.band, { backgroundColor: card.soft }]}>
        <View style={[styles.bandMark, { backgroundColor: card.tone }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardKicker, { color: card.tone }]}>
            {t(`s21Totals.cards.${card.key}.kicker`)}
          </Text>
          <Text style={styles.cardTitle}>
            {t(`s21Totals.cards.${card.key}.title`)}
          </Text>
        </View>
      </View>

      <View style={styles.thead}>
        <Text style={[styles.th, styles.colMonth]}>{t('s21Totals.col.month')}</Text>
        <Text style={[styles.th, styles.colNum]}>{t('s21Totals.col.count')}</Text>
        {card.hasHours ? (
          <Text style={[styles.th, styles.colNum]}>{t('s21Totals.col.hours')}</Text>
        ) : null}
        <Text style={[styles.th, styles.colNum]}>{t('s21Totals.col.studies')}</Text>
      </View>

      {rows.map((r, i) => {
        const shown = hasFigures(r.state);
        const pending = r.state === 'collecting';
        // The year once, where it begins: before September and before
        // January — the month names alone stay on one line in three columns.
        const yearStarts = i === 0 || r.month.endsWith('-01');
        // A late report is worth a glance (amber); who reports to the branch
        // is a plain fact (grey).
        const notes: { text: string; late: boolean }[] = [
          ...(r.late > 0
            ? [{ text: t('s21Totals.lateTag', { count: r.late }), late: true }]
            : []),
          ...(r.direct > 0
            ? [{ text: t('s21Totals.directTag', { count: r.direct }), late: false }]
            : []),
        ];
        return (
          <View key={r.month}>
            {yearStarts ? (
              <Text style={styles.yearDivider}>{r.month.slice(0, 4)}</Text>
            ) : null}
            <View style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
              <View style={styles.trMain}>
                <View style={[styles.colMonth, styles.monthCell]}>
                  <View
                    style={[
                      styles.dot,
                      shown
                        ? { backgroundColor: STATE_DOT[r.state] ?? '#cbd5e1' }
                        : styles.dotEmpty,
                    ]}
                  />
                  <Text
                    style={[styles.month, !shown && styles.muted]}
                    numberOfLines={1}
                  >
                    {monthName(i18n.language, r.month)}
                  </Text>
                </View>
                <Text style={[styles.num, styles.colNum, (pending || !shown) && styles.muted]}>
                  {shown ? r.count : '—'}
                </Text>
                {card.hasHours ? (
                  <Text style={[styles.num, styles.colNum, (pending || !shown) && styles.muted]}>
                    {shown ? r.hours : '—'}
                  </Text>
                ) : null}
                <Text style={[styles.num, styles.colNum, (pending || !shown) && styles.muted]}>
                  {shown ? r.studies : '—'}
                </Text>
              </View>
              {notes.length > 0 ? (
                <Text style={styles.note}>
                  {notes.map((n, k) => (
                    <Text key={k} style={n.late ? styles.noteLate : styles.noteFact}>
                      {k > 0 ? ' · ' : ''}
                      {n.text}
                    </Text>
                  ))}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {card.hasHours && any ? (
        <View style={styles.total}>
          <Text style={styles.totalLabel}>{t('s21Totals.totalHours')}</Text>
          <Text style={[styles.totalValue, { color: card.tone }]}>{hours}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  yearRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  yearChipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  yearChipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#334155' },
  yearChipTextOn: { color: '#fff' },
  body: { padding: 16, paddingBottom: 40 },
  intro: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    marginBottom: 14,
    marginHorizontal: 2,
  },
  cards: { gap: 14 },
  cardsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardWide: { flex: 1 },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bandMark: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  cardKicker: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: '#0f172a',
    marginTop: 2,
  },
  thead: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  th: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tr: { paddingHorizontal: 16, paddingVertical: 9 },
  trMain: { flexDirection: 'row', alignItems: 'center' },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 11, marginTop: 3, marginLeft: 16 },
  noteLate: { fontFamily: 'Manrope_600SemiBold', color: '#b45309' },
  noteFact: { fontFamily: 'Manrope_500Medium', color: '#64748b' },
  yearDivider: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#fff',
  },
  trAlt: { backgroundColor: '#fafbfd' },
  colMonth: { flex: 1.5 },
  colNum: { flex: 1, alignItems: 'flex-end', textAlign: 'right' },
  monthCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  month: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#0f172a' },
  num: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  muted: { color: '#94a3b8' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotEmpty: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: 'transparent' },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  totalLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#334155' },
  totalValue: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 16,
    marginHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#475569' },
  foot: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    marginTop: 10,
    marginHorizontal: 2,
  },
});
