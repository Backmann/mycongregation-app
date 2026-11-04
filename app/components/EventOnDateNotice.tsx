import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { meetingSettingsApi, SpecialEvent, specialEventsApi } from '../lib/api';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import { weekRules } from '../lib/week-rules';
import { formatDayRange } from '../lib/date-range';
import { useMeetingMoves } from '../lib/useMeetingMoves';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Advisory banner for schedulers: shown when the week rules say an event
 * takes this meeting away — a convention, the Memorial, or an event flagged
 * «обычной встречи нет». Purely informational — it never blocks saving.
 *
 * Self-contained: fetches meeting settings and special events itself,
 * reusing the same query keys as the schedule screen so react-query
 * dedupes the requests. Renders null while loading, on invalid week
 * input (the field is free-typed when identity is unlocked), or when
 * no replacing event covers the date.
 */
export function EventOnDateNotice({
  weekStartDate,
  eventType,
}: {
  weekStartDate: string;
  eventType: 'midweek' | 'weekend';
}) {
  const { t, i18n } = useTranslation();

  const weekISO = weekStartDate.trim();
  const validWeek = ISO_DATE.test(weekISO);

  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    enabled: validWeek,
  });
  // All events, under the key the schedule editor around this form already
  // holds (no second request, kept offline). Only what was still ahead lost
  // an event already over in the week being edited (4 November 2026).
  const moves = useMeetingMoves();
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    enabled: validWeek,
  });

  if (!validWeek) return null;

  const version = effectiveVersionFor(settingsQuery.data?.versions, weekISO);
  if (!version) return null;

  // The week rules decide what stands in for the meeting (4 November 2026):
  // a convention cancels the WHOLE week, the Memorial takes one meeting by
  // the kind of day, a flagged event the meeting of the day it covers. The
  // banner had its own copy that missed a Fri–Sun convention for a Thursday
  // part and judged the weekend by «touches Saturday or Sunday».
  const rules = weekRules({
    weekStartISO: weekISO,
    version,
    events: eventsQuery.data ?? [],
    moves,
  });
  const m = rules.meetingOf(eventType);
  const event: SpecialEvent | undefined = m.held ? undefined : (m.by ?? undefined);
  if (!event) return null;

  const loc = i18n.language;
  const start = new Date(`${event.date}T00:00:00`);
  const end = event.endDate ? new Date(`${event.endDate}T00:00:00`) : null;
  const dateLabel = end
    ? formatDayRange(event.date, event.endDate, loc, { year: 'never' })
    : start.toLocaleDateString(loc, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });

  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, pressed && styles.wrapPressed]}
      onPress={() => router.push(`/special-events/${event.id}` as any)}
    >
      <View style={styles.headerRow}>
        <Ionicons name="megaphone" size={16} color="#b45309" />
        <Text style={styles.title}>{t('specialEvents.formNotice.title')}</Text>
        <Ionicons name="chevron-forward" size={16} color="#d6b27a" />
      </View>
      <Text style={styles.eventTitle} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={styles.meta}>
        {dateLabel}
        {event.time ? ` \u00b7 ${event.time}` : ''}
      </Text>
      <Text style={styles.hint}>{t('specialEvents.formNotice.replaces')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  wrapPressed: { opacity: 0.85 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    color: '#b45309',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eventTitle: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#78350f' },
  meta: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#92400e' },
  hint: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#a16207' },
});
