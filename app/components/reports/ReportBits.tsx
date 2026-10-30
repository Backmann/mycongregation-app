import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PioneerYearCard } from '../../lib/api';
import { formatDay } from '../../lib/date-range';

/**
 * The pieces the Reports screens share (28 October 2026) — in the language of
 * the publisher's card, the groups and «Местные потребности»: white cards with
 * large corners, a date plaque, chips, tiles.
 */

export const INK = '#0f172a';
export const MUTED = '#64748b';
export const LINE = '#e2e8f0';
export const BRAND = '#0e7490';

export type Tone = 'due' | 'done' | 'plain' | 'muted';

const PLAQUE: Record<Tone, string> = {
  due: '#fef3c7',
  done: '#dcfce7',
  plain: '#f1f5f9',
  muted: '#f8fafc',
};

/** «СЕН» over «2026» — a month as the date plaques elsewhere show a day. */
export function MonthPlaque({
  month,
  tone = 'plain',
  small,
}: {
  /** YYYY-MM or YYYY-MM-DD. */
  month: string;
  tone?: Tone;
  small?: boolean;
}) {
  const { i18n } = useTranslation();
  const d = new Date(`${month.slice(0, 7)}-01T12:00:00`);
  const name = d
    .toLocaleDateString(i18n.language, { month: 'short' })
    .replace('.', '')
    .toUpperCase();
  const year = small ? String(d.getFullYear()).slice(2) : String(d.getFullYear());
  return (
    <View style={[styles.plaque, small && styles.plaqueSmall, { backgroundColor: PLAQUE[tone] }]}>
      <Text style={[styles.plaqueMonth, small && styles.plaqueMonthSmall]}>{name}</Text>
      <Text style={[styles.plaqueYear, small && styles.plaqueYearSmall]}>{year}</Text>
    </View>
  );
}

export type ChipTone = 'amber' | 'green' | 'blue' | 'grey';
const CHIP: Record<ChipTone, { bg: string; fg: string }> = {
  amber: { bg: '#fef3c7', fg: '#92400e' },
  green: { bg: '#dcfce7', fg: '#047857' },
  blue: { bg: '#e0f2fe', fg: '#0369a1' },
  grey: { bg: '#f1f5f9', fg: '#475569' },
};

export function Chip({ tone, text }: { tone: ChipTone; text: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: CHIP[tone].bg }]}>
      <Text style={[styles.chipText, { color: CHIP[tone].fg }]}>{text}</Text>
    </View>
  );
}

/** A figure and what it is. */
export function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/**
 * A regular pioneer's service year: twelve divisions, one a month (full at
 * the monthly pace), and the figures as tiles.
 *
 * Calm by design (Lionel, 28 October 2026: «спокойно и деликатно»): no word
 * judging him. The pioneer sees the goal; an elder (when `year.elders` came)
 * sees the pace towards the 560 that lets him carry on as well.
 */
export function PioneerYear({ year, title }: { year: PioneerYearCard; title?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const letter = (m: string) =>
    new Date(`${m.slice(0, 7)}-01T12:00:00`)
      .toLocaleDateString(lang, { month: 'narrow' })
      .toUpperCase();
  const monthLong = (ym: string) =>
    new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Point 9 (30 October 2026): a year without the norm is measured against
  // nothing — hours by month, no goal, no «осталось». A pioneering that ended
  // within the year shows the months he served and no goal either.
  const free = !!year.noQuota;
  const ended = !!year.endedIn;
  const goal = year.goal;
  const e = free ? undefined : year.elders;
  const pioneerMonths = year.months.filter((m) => m.state !== 'notPioneer');
  const reported = pioneerMonths.filter((m) => m.state === 'reported' || m.state === 'zero').length;
  const left = goal !== null ? Math.max(0, Math.round((goal - year.hours) * 10) / 10) : 0;
  const badge = free
    ? t('reports.year.noQuotaBadge')
    : ended
      ? t('reports.year.endedBadge', { month: monthLong(year.endedIn!) })
      : null;
  const quiet = free
    ? e === undefined && year.elders
      ? t('reports.year.noQuotaElders', { date: formatDay(year.noQuota!, lang, { year: 'always' }) })
      : t('reports.year.noQuotaLine')
    : ended
      ? t('reports.year.endedLine', { month: monthLong(year.endedIn!) })
      : e && e.toMinimum !== null && e.toGoal !== null
        ? t('reports.year.eldersLine', { min: e.toMinimum, goal: e.toGoal })
        : goal !== null && year.startedIn
          ? t('reports.year.startedLine', { month: monthLong(year.startedIn), n: goal, pace: year.pace })
          : t('reports.year.paceLine', { n: year.pace });
  return (
    <View>
      <View style={styles.kickRow}>
        <Text style={styles.kicker}>
          {title ??
            t('reports.year.title', { from: year.serviceYear - 1, to: year.serviceYear })}
        </Text>
        {badge ? (
          <View style={[styles.badge, ended && !free && styles.badgeEnded]}>
            <Text style={[styles.badgeText, ended && !free && styles.badgeTextEnded]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.segs}>
        {year.months.map((m) => {
          const share =
            m.state === 'notPioneer'
              ? 0
              : free
                ? m.state === 'reported'
                  ? 1
                  : 0
                : Math.min(1, (m.hours ?? 0) / year.pace);
          return (
            <View
              key={m.reportMonth}
              style={[styles.seg, m.state === 'notPioneer' && styles.segOff]}
              accessibilityLabel={
                m.hours !== null ? `${letter(m.reportMonth)} ${m.hours}` : undefined
              }
            >
              <View style={[styles.segFill, free && styles.segFillFree, { width: `${share * 100}%` }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.segs}>
        {year.months.map((m) => (
          <Text key={m.reportMonth} style={styles.segLetter}>
            {letter(m.reportMonth)}
          </Text>
        ))}
      </View>
      {free ? (
        <View style={[styles.segs, { marginTop: 1 }]}>
          {year.months.map((m) => (
            <Text key={m.reportMonth} style={styles.segHours}>
              {m.state === 'reported' && m.hours !== null ? String(m.hours) : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {e && !ended ? (
        <View style={styles.tiles}>
          <Tile value={t('reports.year.h', { n: year.hours })} label={t('reports.year.hoursIn', { n: year.countedMonths })} />
          <Tile
            value={e.expectedGoal !== null ? t('reports.year.h', { n: e.expectedGoal }) : '—'}
            label={t('reports.year.paceGoal', { n: goal ?? 600 })}
          />
          <Tile
            value={e.expectedMinimum !== null ? t('reports.year.h', { n: e.expectedMinimum }) : '—'}
            label={t('reports.year.paceMinimum', { n: e.yearMinimum })}
          />
        </View>
      ) : goal === null ? (
        <View style={styles.tiles}>
          <Tile
            value={String(year.hours)}
            label={ended ? t('reports.year.hoursAsPioneer') : t('reports.year.hoursYear')}
          />
          <Tile
            value={String(ended ? pioneerMonths.length : reported)}
            label={
              ended
                ? t('reports.year.monthsServed', { count: pioneerMonths.length })
                : t('reports.year.monthsIn', { count: reported })
            }
          />
        </View>
      ) : (
        <View style={styles.tiles}>
          <Tile value={String(year.hours)} label={t('reports.year.hoursYear')} />
          <Tile value={String(goal)} label={t('reports.year.goal')} />
          <Tile value={String(left)} label={t('reports.year.left')} />
        </View>
      )}
      <Text style={styles.quiet}>{quiet}</Text>
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LINE,
    padding: 18,
    marginBottom: 12,
  },
  due: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  done: { backgroundColor: '#f7fefa', borderColor: '#bbf7d0' },
});

const styles = StyleSheet.create({
  plaque: {
    width: 58,
    height: 62,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plaqueSmall: { width: 46, height: 48, borderRadius: 12 },
  plaqueMonth: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: INK, lineHeight: 21 },
  plaqueMonthSmall: { fontSize: 14, lineHeight: 17 },
  plaqueYear: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: MUTED, letterSpacing: 0.4 },
  plaqueYearSmall: { fontSize: 10 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tile: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#eef2f7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tileValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: INK, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: MUTED, marginTop: 1 },
  kicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  segs: { flexDirection: 'row', gap: 4, marginTop: 12 },
  seg: { flex: 1, height: 10, borderRadius: 4, backgroundColor: LINE, overflow: 'hidden' },
  segOff: { backgroundColor: '#f8fafc' },
  segFill: { height: '100%', backgroundColor: BRAND },
  segFillFree: { backgroundColor: '#67b7c9' },
  segHours: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 10,
    color: '#334155',
  },
  kickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { backgroundColor: '#ecfeff', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  badgeEnded: { backgroundColor: '#f1f5f9' },
  badgeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, color: BRAND },
  badgeTextEnded: { color: '#475569' },
  segLetter: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Manrope_700Bold',
    fontSize: 9.5,
    color: '#94a3b8',
    marginTop: -7,
  },
  quiet: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: MUTED, marginTop: 10, lineHeight: 18 },
});
