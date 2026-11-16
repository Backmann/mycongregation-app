import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BRAND, INK, MUTED } from '../components/reports/ReportBits';

/**
 * An address that is no page of the app (16 November 2026).
 *
 * Expo Router's own page for it said "Unmatched Route" in English with a link
 * to the list of all routes, and, opened from scratch in the browser, it did
 * not match the page shell the server sends — React threw #418 and drew the
 * page again. This one is a route file like the others, loaded the same way,
 * and says it plainly, with the way home.
 */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <View style={s.page}>
      <Stack.Screen options={{ title: t('notFoundPage.title') }} />
      <View style={s.card}>
        <Ionicons name="compass-outline" size={36} color={BRAND} />
        <Text style={s.title}>{t('notFoundPage.title')}</Text>
        <Text style={s.body}>{t('notFoundPage.body')}</Text>
        <Pressable
          onPress={() => router.replace('/' as never)}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}
          accessibilityRole="link"
        >
          <Text style={s.btnText}>{t('notFoundPage.home')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef1f4', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    gap: 10,
    alignItems: 'center',
    maxWidth: 420,
    width: '100%',
  },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: INK, textAlign: 'center' },
  body: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: MUTED, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 6, backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
});
