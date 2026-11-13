import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/**
 * The way into a territory's division between groups for today (13 November
 * 2026): on the holder's and the group's card and on the keepers' page.
 */
export function DivisionButton({ territoryId }: { territoryId: string }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => router.push(`/cart/division/${territoryId}` as never)}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <View style={s.icon}>
        <Ionicons name="git-branch-outline" size={18} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>{t('territories.division.entry')}</Text>
        <Text style={s.hint}>{t('territories.division.entryHint')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={BRAND} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
  },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 1 },
});
