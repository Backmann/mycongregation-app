import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HallBusy } from '../lib/api';
import { hallBusyLine } from '../lib/hall-busy';

/**
 * «В этот день есть и другое» — for the planner, not for the congregation
 * (13 October 2026). The pioneer school or an event on the day of a field-
 * service meeting: the meeting stands as planned; this only makes sure the
 * planner sees it before the month is announced.
 *
 * Drawn apart from the notice for everyone (components/FieldNotice): that
 * one is filled amber and says what the reader must know; this one is a
 * thin outline with a calendar, and says what the planner should check.
 */
export function HallBusyNote({ list, lead }: { list: HallBusy[]; lead?: string }) {
  if (list.length === 0) return null;
  const lines = [...new Set(list.map(hallBusyLine))];
  return (
    <View style={styles.box}>
      <Ionicons name="calendar-outline" size={15} color="#b45309" style={styles.icon} />
      <View style={styles.body}>
        {lead ? <Text style={styles.lead}>{lead}</Text> : null}
        {lines.map((l) => (
          <Text key={l} style={styles.text}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    alignSelf: 'stretch',
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#f59e0b',
    backgroundColor: '#ffffff',
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 1 },
  lead: { fontSize: 12.5, color: '#92400e', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  text: { fontSize: 13, lineHeight: 18, color: '#78350f', fontFamily: 'Manrope_500Medium' },
});
