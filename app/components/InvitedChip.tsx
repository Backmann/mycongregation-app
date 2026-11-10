import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { inviteesOf } from '../lib/invitations';

/**
 * «для старейшин · 9 приглашены» — under an event for the invited only
 * (10 November 2026), so that nobody wonders why a brother next to him does
 * not see it. The count only reaches those who keep the events.
 */
export function InvitedChip({
  type,
  count,
}: {
  type: string | null | undefined;
  count?: number | null;
}) {
  const { t } = useTranslation();
  const who = inviteesOf(type);
  if (!who) return null;
  const text = [
    t(`specialEvents.invited.for.${who}`),
    typeof count === 'number' ? t('specialEvents.invited.count', { count }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.chip}>
      <Ionicons name="people-outline" size={13} color="#3730a3" />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  text: { fontSize: 13, lineHeight: 17, fontFamily: 'Manrope_700Bold', color: '#3730a3' },
});
