import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { territoriesApi } from '../../lib/api';
import { toLookAt } from '../../lib/homes';
import { BRAND, INK, MUTED, cardStyles } from '../reports/ReportBits';

/**
 * «Жилые дома» on a territory's card (15 November 2026), for the keepers:
 * how many homes the land register and the rule count here, how many
 * buildings are left out, how many to look at, and the way to them.
 */
export function HomesCard({ territoryId }: { territoryId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['territories', 'homes', territoryId],
    queryFn: () => territoriesApi.homes(territoryId),
  });
  if (!q.data) return null;
  const { counts, houses } = q.data;
  const unsure = houses.filter(toLookAt).length;
  return (
    <View style={[cardStyles.card, s.card]}>
      <View style={s.head}>
        <Text style={s.title}>{t('territories.homes.title')}</Text>
        <Text style={s.n}>{counts.homes}</Text>
      </View>
      <Text style={s.why}>{t('territories.homes.cardWhy', { n: counts.notHomes })}</Text>
      {unsure || counts.marked || counts.gone ? (
        <View style={s.chips}>
          {unsure ? (
            <Text style={[s.chip, s.amber]}>{t('territories.homes.unsureChip', { n: unsure })}</Text>
          ) : null}
          {counts.marked ? (
            <Text style={[s.chip, s.teal]}>{t('territories.homes.markedChip', { n: counts.marked })}</Text>
          ) : null}
          {counts.gone ? (
            <Text style={[s.chip, s.amber]}>{t('territories.homes.goneChip', { n: counts.gone })}</Text>
          ) : null}
        </View>
      ) : null}
      <Pressable
        onPress={() => router.push(`/cart/territory/homes/${territoryId}` as never)}
        style={s.open}
        accessibilityRole="button"
      >
        <Text style={s.openText}>{t('territories.homes.open')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: INK },
  n: { fontFamily: 'Manrope_700Bold', fontSize: 22, color: INK },
  why: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { fontFamily: 'Manrope_500Medium', fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  amber: { backgroundColor: '#fdf1df', color: '#7a4300' },
  teal: { backgroundColor: '#e8f0f2', color: '#164a56' },
  open: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openText: { fontFamily: 'Manrope_600SemiBold', color: '#ffffff', fontSize: 15 },
});
