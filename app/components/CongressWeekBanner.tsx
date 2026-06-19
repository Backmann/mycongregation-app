import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SpecialEvent } from '../lib/api';

/**
 * Shown for a week that contains a regional convention or circuit assembly: a
 * quick link to that congress's program. The "no meetings" message itself lives
 * on the event card in the week's events list, so this banner is purely the
 * program shortcut and is hidden entirely when no program link is set.
 */
export function CongressWeekBanner({ event }: { event: SpecialEvent }) {
  const { t } = useTranslation();

  if (!event.programUrl) return null;

  const label =
    event.type === 'circuit_assembly'
      ? t('schedule.congressWeek.programCircuit')
      : t('schedule.congressWeek.programRegional');

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => Linking.openURL(event.programUrl!)}
      >
        <Ionicons name="document-text-outline" size={20} color="#92400e" />
        <Text style={styles.text}>{label}</Text>
        <Ionicons name="open-outline" size={16} color="#b45309" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardPressed: { backgroundColor: '#fef3c7' },
  text: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#78350f',
    textDecorationLine: 'underline',
  },
});
