import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { SignedInPlace } from '../lib/api';
import { placeLabel } from '../lib/this-place';

/**
 * «Где вы вошли» — one line per place, in words a person would use.
 *
 * Shown to the person in «Профиль» and to whoever helps them in the card.
 * Both read the same list, so «у меня не открывается» can be answered by
 * looking: signed in in the browser, never from the icon.
 */
export function SignedInPlaces({
  places,
  emptyText,
}: {
  places: SignedInPlace[];
  /** What to say when the account is signed in nowhere. */
  emptyText: string;
}) {
  const { t, i18n } = useTranslation();

  if (places.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  const when = (iso: string): string => {
    const d = new Date(iso);
    const startOf = (x: Date) =>
      new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
    if (days <= 0) return t('places.today');
    if (days === 1) return t('places.yesterday');
    return d.toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <View>
      {places.map((p, i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
          <Ionicons
            name={
              p.kind === 'app'
                ? 'phone-portrait-outline'
                : p.kind === 'homescreen'
                  ? 'apps-outline'
                  : 'globe-outline'
            }
            size={18}
            color={p.current ? '#0e7490' : '#64748b'}
          />
          <View style={styles.col}>
            <Text style={styles.label}>
              {placeLabel(t, p.platform, p.kind)}
            </Text>
            <Text style={[styles.sub, p.current && styles.subHere]}>
              {p.current
                ? t('places.here')
                : t('places.lastActive', { when: when(p.lastActiveAt) })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  col: { flex: 1 },
  label: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  sub: { marginTop: 1, fontSize: 13, color: '#64748b' },
  subHere: { color: '#0e7490' },
  empty: { fontSize: 14, lineHeight: 20, color: '#64748b', paddingVertical: 8 },
});
