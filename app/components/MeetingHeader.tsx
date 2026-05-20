import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../lib/i18n';
import { MeetingSettingsVersion } from '../lib/api';
import { meetingDate } from '../lib/meeting-schedule';

type Props = {
  weekStart: Date;
  version: MeetingSettingsVersion | null;
  eventType: 'midweek' | 'weekend';
};

function formatDate(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * Compact banner showing when/where a meeting takes place, derived from the
 * effective meeting-settings version. Renders nothing if no version applies.
 */
export function MeetingHeader({ weekStart, version, eventType }: Props) {
  if (!version) return null;

  const dow =
    eventType === 'midweek' ? version.midweekDow : version.weekendDow;
  const rawTime =
    eventType === 'midweek' ? version.midweekTime : version.weekendTime;
  const time = (rawTime || '').slice(0, 5);
  const date = meetingDate(weekStart, dow);
  const locale = i18n.language || 'en';
  const dateStr = formatDate(date, locale);

  return (
    <View style={styles.banner}>
      <View style={styles.line}>
        <Ionicons name="calendar-outline" size={14} color="#0369a1" />
        <Text style={styles.when}>
          {dateStr}
          {time ? ` · ${time}` : ''}
        </Text>
      </View>
      {!!version.address && (
        <View style={styles.line}>
          <Ionicons name="location-outline" size={14} color="#64748b" />
          <Text style={styles.where} numberOfLines={2}>
            {version.address}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 3,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  when: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0c4a6e',
    textTransform: 'capitalize',
  },
  where: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
  },
});
