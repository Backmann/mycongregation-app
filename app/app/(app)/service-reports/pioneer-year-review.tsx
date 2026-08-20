import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import i18n from '../../../lib/i18n';
import { PioneerYearRow, serviceReportsApi } from '../../../lib/api';
import { LoadFailure } from '../../../components/LoadFailure';

/**
 * Where each regular pioneer stands, at the end of the service year.
 *
 * The screen behind the calendar task «Обзор служения общих пионеров»: without
 * it the brothers would open twelve S-21 cards and add up by hand, which is
 * both slow and the kind of arithmetic that goes wrong quietly.
 *
 * THREE THINGS IT REFUSES TO DO. It never says a man should stop pioneering —
 * that decision belongs to the service committee, and a screen that phrased it
 * would be making it. It models no credit hours: a pioneer writes those in his
 * own note, so the notes are shown beside the numbers instead. And it never
 * presents a total without saying which months are counted — read on 20 August
 * without that line, every man in the list looks behind.
 */
export default function PioneerYearReviewScreen() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pioneer-year-review'],
    queryFn: () => serviceReportsApi.getPioneerYearReview(),
  });

  /**
   * The month in the case a sentence needs: «Пионер с августа», not «с август».
   *
   * Russian declines it, and `format('MMMM')` gives the dictionary form. The
   * day-and-month format is the one every locale writes correctly, so it is
   * asked for and the day dropped — one line instead of a table of endings.
   */
  const monthName = (iso: string) => {
    const full = dayjs(iso).locale(i18n.language).format('D MMMM');
    return full.split(' ').slice(1).join(' ') || full;
  };

  /** With the year, because a service year spans two of them. */
  const monthWithYear = (iso: string) =>
    `${monthName(iso)} ${iso.slice(0, 4)}`;

  if (isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 48 }} />;
  }
  if (error || !data) {
    return (
      <LoadFailure error={error} onRetry={() => void refetch()} />
    );
  }

  const shortCount = data.rows.filter((r) => r.short).length;

  const card = (row: PioneerYearRow) => (
    <View
      key={row.publisherId}
      style={[styles.card, row.short && styles.cardShort]}
    >
      <View style={styles.head}>
        <Text style={styles.name}>{row.displayName}</Text>
        <Text style={[styles.hours, row.short && styles.hoursShort]}>
          {t('pioneerReview.hours', { count: row.hours })}
        </Text>
      </View>

      {row.startedMidYear ? (
        /* No target for him, and no highlight: he was not a pioneer for the
           whole year, and measuring him against it would report a shortfall he
           could not have avoided. */
        <Text style={styles.since}>
          {t('pioneerReview.sinceOnly', {
            month: row.pioneerSince ? monthName(row.pioneerSince) : '',
          })}
        </Text>
      ) : (
        <View style={styles.figures}>
          {row.toMinimum && row.toMinimum > 0 ? (
            <Text style={styles.toMinimum}>
              {t('pioneerReview.toMinimum', { count: row.toMinimum })}
            </Text>
          ) : (
            <Text style={styles.meets}>{t('pioneerReview.meets')}</Text>
          )}
          {row.toGoal && row.toGoal > 0 ? (
            <Text style={styles.toGoal}>
              {t('pioneerReview.toGoal', { count: row.toGoal })}
            </Text>
          ) : null}
        </View>
      )}

      {/* Hours for only a few months, and no date of appointment on the card.
          Then the low total may mean «he became a pioneer in May», and the
          screen must not quietly present it as a shortfall. We do not guess —
          we say what is missing and let the brothers check. */}
      {!row.startedMidYear &&
      !row.pioneerSince &&
      row.monthsReported > 0 &&
      row.monthsReported < data.monthsElapsed - 1 ? (
        <Text style={styles.unknownSince}>
          {t('pioneerReview.checkSince', {
            count: row.monthsReported,
            of: data.monthsElapsed,
          })}
        </Text>
      ) : null}

      {/* The pace, which the total hides: half a year at 60 and a whole year
          at 30 add up the same and mean opposite things. */}
      {row.pace !== null ? (
        <Text style={styles.pace}>
          {t('pioneerReview.pace', {
            pace: row.pace,
            count: row.monthsReported,
          })}
        </Text>
      ) : (
        <Text style={styles.pace}>{t('pioneerReview.noReports')}</Text>
      )}

      {/* Where credit hours are written, in the pioneer's own words. */}
      {row.notes.map((n) => (
        <View key={n.reportMonth} style={styles.note}>
          <Text style={styles.noteMonth}>
            {monthWithYear(n.reportMonth)}
          </Text>
          <Text style={styles.noteText}>{n.note}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.lede}>
        <Ionicons name="information-circle-outline" size={16} color="#0369a1" />
        <View style={{ flex: 1 }}>
          <Text style={styles.ledeText}>
            {t('pioneerReview.counted', { count: data.monthsElapsed })}
            {data.collectingMonth
              ? ' ' +
                t('pioneerReview.collecting', {
                  month: monthName(data.collectingMonth),
                })
              : ''}
          </Text>
          <Text style={styles.ledeHint}>{t('pioneerReview.rule')}</Text>
        </View>
      </View>

      {data.rows.length === 0 ? (
        <Text style={styles.empty}>{t('pioneerReview.nobody')}</Text>
      ) : (
        <>
          <Text style={styles.summary}>
            {shortCount > 0
              ? t('pioneerReview.shortCount', {
                  count: shortCount,
                  total: data.rows.length,
                })
              : t('pioneerReview.allFine', { count: data.rows.length })}
          </Text>
          {data.rows.map(card)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' },
  lede: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  ledeText: { fontSize: 13, color: '#075985', lineHeight: 19 },
  ledeHint: { fontSize: 12, color: '#0369a1', lineHeight: 17, marginTop: 4 },
  summary: {
    fontSize: 12.5,
    color: '#64748b',
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8edf3',
    padding: 14,
    marginBottom: 10,
  },
  cardShort: { borderColor: '#fbbf24', backgroundColor: '#fffbeb' },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 15.5,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  hours: {
    fontSize: 19,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  hoursShort: { color: '#92400e' },
  figures: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 6 },
  toMinimum: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  meets: { fontSize: 13, color: '#15803d' },
  toGoal: { fontSize: 13, color: '#64748b' },
  since: { fontSize: 13, color: '#475569', marginTop: 6 },
  unknownSince: {
    fontSize: 12.5,
    color: '#b45309',
    lineHeight: 18,
    marginTop: 6,
  },
  pace: { fontSize: 12.5, color: '#64748b', marginTop: 8 },
  note: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef2f6',
  },
  noteMonth: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  noteText: { fontSize: 13, color: '#334155', lineHeight: 19, marginTop: 2 },
  empty: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 32 },
});
