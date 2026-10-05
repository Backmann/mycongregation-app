import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { sourceHref } from '../lib/source-link';

/**
 * «Открыть источник» — the link a field-service meeting carries, drawn the
 * same wherever the meeting is shown (5 October 2026).
 *
 * It stood on Home, on «Встречи для проповеди» and in the planning section,
 * each with its own few lines of markup, and not at all in the Programme —
 * the one place people read the week from. One component now: the same
 * words, the same icon, the same touch area, and an address typed without
 * «https://» still opens (lib/source-link).
 *
 * Draws nothing when there is no usable address.
 */
export function SourceLink({ url }: { url: string | null | undefined }) {
  const { t } = useTranslation();
  const href = sourceHref(url);
  if (!href) return null;
  return (
    <Pressable
      onPress={() => {
        Linking.openURL(href).catch(() => {});
      }}
      hitSlop={8}
      accessibilityRole="link"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name="link-outline" size={14} color={LINK} />
      <Text style={styles.text} numberOfLines={1}>
        {t('fieldService.openLink')}
      </Text>
    </Pressable>
  );
}

const LINK = '#0369a1';

const styles = StyleSheet.create({
  // As wide as its words, not as the row: a tap beside it belongs to the row.
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 2 },
  pressed: { opacity: 0.6 },
  text: { fontSize: 13, color: LINK, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
});
