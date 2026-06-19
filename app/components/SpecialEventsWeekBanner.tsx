import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { SpecialEvent } from '../lib/api';

/**
 * Shows the special events that fall within the currently displayed schedule
 * week. Events flagged `replacesMeeting` carry a "no regular meeting" note.
 * Purely additive — rendered above the meeting sections; renders nothing when
 * there are no events for the week.
 */
export function SpecialEventsWeekBanner({ events }: { events: SpecialEvent[] }) {
  const { t } = useTranslation();
  if (!events || events.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('specialEvents.weekTitle')}</Text>
      <View style={styles.body}>
        {events.map((e) => {
          const start = dayjs(e.date);
          const rangeText = e.endDate
            ? `${start.format('DD.MM')} – ${dayjs(e.endDate).format('DD.MM.YYYY')}`
            : start.format('DD.MM.YYYY');
          const typeLabel = e.type
            ? t(`specialEvents.types.${e.type}`, e.type)
            : null;
          const meta = [rangeText, e.time, typeLabel].filter(Boolean).join(' · ');
          const coName =
            e.type === 'circuit_overseer_visit'
              ? [e.coFirstName, e.coLastName].filter(Boolean).join(' ').trim()
              : '';
          const isCongress =
            e.type === 'regional_convention' || e.type === 'circuit_assembly';
          return (
            <Pressable
              key={e.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/special-events/${e.id}` as any)}
            >
              <Ionicons
                name="megaphone-outline"
                size={20}
                color="#0ea5e9"
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{e.title}</Text>
                {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                {coName ? (
                  <Text style={styles.coName}>
                    {coName}
                    {e.coWifeName
                      ? ` · ${t('specialEvents.coWife', { name: e.coWifeName })}`
                      : ''}
                  </Text>
                ) : null}
                {isCongress || e.replacesMeeting ? (
                  <View style={styles.noMeeting}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={14}
                      color="#b45309"
                    />
                    <Text style={styles.noMeetingText}>
                      {t(
                        isCongress
                          ? 'schedule.congressWeek.noMeetings'
                          : 'specialEvents.replacesMeetingHint',
                      )}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  body: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cardPressed: { backgroundColor: '#f8fafc' },
  title: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  coName: { fontSize: 13, color: '#0f172a', fontWeight: '500', marginTop: 2 },
  noMeeting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  noMeetingText: { fontSize: 12, color: '#b45309', fontWeight: '500' },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },
});
