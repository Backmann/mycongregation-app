import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SpecialEvent } from '../lib/api';

/**
 * Shown for a week that contains a regional convention or circuit assembly:
 * no congregation meetings are held (midweek, weekend, duties and cleaning are
 * hidden by the schedule; field-service meetings stay). The event itself is
 * still listed in the week's events banner above.
 */
export function CongressWeekBanner({ event }: { event: SpecialEvent }) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons
            name="megaphone"
            size={18}
            color="#92400e"
            style={{ marginTop: 1 }}
          />
          <Text style={styles.text}>{t('schedule.congressWeek.noMeetings')}</Text>
        </View>
        {event.programUrl ? (
          <Pressable
            style={styles.linkBtn}
            onPress={() => Linking.openURL(event.programUrl!)}
            hitSlop={6}
          >
            <Ionicons name="document-outline" size={14} color="#92400e" />
            <Text style={styles.linkText}>
              {t('specialEvents.fields.programUrl')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginHorizontal: 16 },
  card: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#78350f',
    lineHeight: 20,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    marginLeft: 26,
  },
  linkText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
