import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

/**
 * A congregation meeting moved for one week (5 November 2026) — one look
 * wherever it is drawn: Home, its next-card, the Programme feed, «Мои
 * назначения». A quiet amber band with a swap icon: it must be seen at a
 * glance without shouting louder than the meeting itself.
 *
 *  - `from`: on the meeting, on its new day — «Перенесена · обычно ср, 11 нояб., 19:00»;
 *  - `to`: on the old day's stand-in — «Перенесена на чт, 12 нояб., 18:30».
 */
export function MovedMark({
  mode,
  dateISO,
  time,
  compact,
}: {
  mode: 'from' | 'to';
  dateISO: string;
  time?: string | null;
  /** One line under a row, rather than a band on a card. */
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const when = [
    new Date(`${dateISO}T12:00:00Z`).toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }),
    time || null,
  ]
    .filter(Boolean)
    .join(', ');
  const text = t(mode === 'from' ? 'schedule.move.markFrom' : 'schedule.move.markTo', { when });
  return (
    <View
      style={[styles.band, compact && styles.compact]}
      accessible
      accessibilityLabel={`${t('schedule.move.moved')}. ${text}`}
    >
      <View style={styles.pill}>
        <Ionicons name="swap-horizontal" size={12} color="#ffffff" />
        <Text style={styles.pillText}>{t('schedule.move.moved')}</Text>
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 10,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    marginTop: 8,
  },
  compact: { marginTop: 6, paddingVertical: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#c2410c',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pillText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  text: { fontSize: 12.5, fontFamily: 'Manrope_600SemiBold', color: '#9a3412', flexShrink: 1 },
});
