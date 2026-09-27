import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { SpecialEvent } from '../lib/api';

/**
 * «The meeting that day goes ahead with changes» — and which: the words, the
 * hour, the place (27 September). One look for the event's page and its
 * place in the programme, so the two cannot describe the same change
 * differently.
 */
export function MeetingChangeNote({
  event,
  compact = false,
}: {
  event: Pick<
    SpecialEvent,
    'meetingMode' | 'meetingNote' | 'meetingTime' | 'meetingAddress'
  >;
  /** One line for lists; the full box for the event's page. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (event.meetingMode !== 'changed') return null;
  if (compact) {
    return (
      <Text style={styles.compact}>{t('specialEvents.meeting.changedHint')}</Text>
    );
  }
  const at = [
    event.meetingTime
      ? t('specialEvents.meeting.startsAt', { time: event.meetingTime })
      : null,
    event.meetingAddress?.trim() || null,
  ].filter(Boolean);
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="swap-horizontal" size={16} color="#b45309" />
        <Text style={styles.title}>
          {t('specialEvents.meeting.changedHint')}
        </Text>
      </View>
      {event.meetingNote?.trim() ? (
        <Text style={styles.note}>{event.meetingNote.trim()}</Text>
      ) : null}
      {at.length > 0 ? <Text style={styles.at}>{at.join(' · ')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { fontSize: 13, color: '#b45309', marginTop: 4 },
  box: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    fontWeight: '600',
    color: '#92400e',
  },
  note: { fontSize: 14, color: '#1e293b', lineHeight: 20 },
  at: { fontSize: 13, color: '#475569' },
});
