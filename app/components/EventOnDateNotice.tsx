import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { meetingSettingsApi, SpecialEvent, specialEventsApi } from '../lib/api';
import { effectiveVersionFor, meetingDate } from '../lib/meeting-schedule';
import { formatDateISO } from '../lib/dates';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Advisory banner for schedulers: shown when a special event with
 * replacesMeeting=true covers the meeting date implied by the selected
 * week + event type. Purely informational — it never blocks saving.
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
  const eventsQuery = useQuery({
    queryKey: ['special-events'],
    queryFn: () => specialEventsApi.list(),
    enabled: validWeek,
  });

  if (!validWeek) return null;

  const version = effectiveVersionFor(settingsQuery.data?.versions, weekISO);
  if (!version) return null;

  const dow = eventType === 'midweek' ? version.midweekDow : version.weekendDow;
  if (!dow) return null;

  const meetingISO = formatDateISO(
    meetingDate(new Date(`${weekISO}T00:00:00`), dow),
  );

  const event: SpecialEvent | undefined = (eventsQuery.data ?? []).find(
    (e) =>
      e.replacesMeeting &&
      e.date <= meetingISO &&
      (e.endDate ?? e.date) >= meetingISO,
  );
  if (!event) return null;

  const loc = i18n.language;
  const start = new Date(`${event.date}T00:00:00`);
  const end = event.endDate ? new Date(`${event.endDate}T00:00:00`) : null;
  const dateLabel = end
    ? `${start.toLocaleDateString(loc, { day: 'numeric', month: 'long' })} \u2013 ${end.toLocaleDateString(loc, { day: 'numeric', month: 'long' })}`
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
    fontWeight: '700',
    color: '#b45309',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#78350f' },
  meta: { fontSize: 13, color: '#92400e' },
  hint: { fontSize: 12, color: '#a16207', fontStyle: 'italic' },
});
