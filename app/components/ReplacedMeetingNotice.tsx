import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SpecialEvent } from '../lib/api';

/**
 * Rendered in place of a regular meeting section when a special event with
 * replacesMeeting=true covers that meeting's date. Assignments that already
 * exist for the replaced meeting are not deleted — only hidden, with a count
 * so the scheduler can re-home or cancel them.
 */
export function ReplacedMeetingNotice({
  event,
  eventType,
  hiddenCount,
}: {
  event: SpecialEvent;
  eventType: 'midweek' | 'weekend';
  hiddenCount: number;
}) {
  const { t, i18n } = useTranslation();
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
    <View style={styles.wrap}>
      <Text style={styles.replacedLabel}>
        {t(`home.meeting.${eventType}`)} · {t('specialEvents.replaced.insteadOf')}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/special-events/${event.id}` as any)}
      >
        <View style={styles.headerRow}>
          <Ionicons name="megaphone" size={18} color="#b45309" />
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#d6b27a" />
        </View>
        <Text style={styles.meta}>
          {dateLabel}
          {event.time ? ` · ${event.time}` : ''}
        </Text>
        {event.address ? (
          <Text style={styles.meta} numberOfLines={1}>
            {event.address}
          </Text>
        ) : null}
        {(event.mapUrl || event.programUrl) && (
          <View style={styles.linksRow}>
            {event.mapUrl ? (
              <Pressable
                style={styles.linkBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  Linking.openURL(event.mapUrl!);
                }}
                hitSlop={6}
              >
                <Ionicons name="map-outline" size={14} color="#92400e" />
                <Text style={styles.linkText}>
                  {t('specialEvents.fields.mapUrl')}
                </Text>
              </Pressable>
            ) : null}
            {event.programUrl ? (
              <Pressable
                style={styles.linkBtn}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  Linking.openURL(event.programUrl!);
                }}
                hitSlop={6}
              >
                <Ionicons name="document-outline" size={14} color="#92400e" />
                <Text style={styles.linkText}>
                  {t('specialEvents.fields.programUrl')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {hiddenCount > 0 ? (
          <Text style={styles.hiddenText}>
            {t('specialEvents.replaced.hidden', { count: hiddenCount })}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginHorizontal: 16 },
  replacedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
  },
  cardPressed: { backgroundColor: '#fef3c7' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#78350f',
  },
  meta: { fontSize: 13, color: '#92400e', marginTop: 4 },
  linksRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  hiddenText: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
