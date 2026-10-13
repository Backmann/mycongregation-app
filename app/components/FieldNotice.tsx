import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * The notice for everyone on a field-service meeting (13 October 2026):
 * «Зал на ремонте — собираемся у входа в парк».
 *
 * One strip, the same wherever the meeting is drawn — Home, the Programme,
 * the month, the week, one's own assignments — so that what is different
 * this Saturday is recognised at a glance rather than read as material. The
 * amber is the one already used for «в этом году не посещены» and the
 * event warning in the meeting window: a thing to notice, not an error.
 *
 * `big` is for the nearest meeting on Home, the place people look on the
 * morning itself.
 */
export function FieldNotice({ text, big }: { text?: string | null; big?: boolean }) {
  if (!text || !text.trim()) return null;
  return (
    <View style={[styles.strip, big && styles.stripBig]}>
      <Ionicons name="alert-circle" size={big ? 18 : 15} color="#b45309" style={styles.icon} />
      <Text style={[styles.text, big && styles.textBig]}>{text.trim()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    alignSelf: 'stretch',
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  stripBig: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, marginTop: 2 },
  icon: { marginTop: 1 },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#78350f',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  textBig: { fontSize: 14.5, lineHeight: 20 },
});
