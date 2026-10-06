import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { auxiliaryPioneersApi } from '../../../lib/api';
import { monthLabel } from '../../../lib/month-label';
import { capitalizeFirst } from '../../../lib/relative-time';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { FONT } from '../../../lib/typography';
import { LoadFailure } from '../../../components/LoadFailure';

/**
 * Who serves as an auxiliary pioneer this month — for everybody.
 *
 * Lionel, 6 October 2026: a publisher should be able to see who serves beside
 * her this month, so that she can go out with them. THIS MONTH, AND NOTHING
 * ELSE: names. No hours, no «до отмены · с марта», no other month, no
 * journal — the server gives this screen nothing more than it shows
 * (GET /auxiliary-pioneers/serving-now).
 *
 * The working list — month by month, with the hour goal and the journal — is
 * /cart/auxiliary-pioneers, for those who keep it. The row in «Служение» has
 * one name for both and leads each person to their own screen.
 *
 * The way out at the foot is the point of the whole screen: having seen who
 * serves, one tap shows when to go out with them.
 */
export default function AuxiliaryPioneersThisMonthScreen() {
  const { t, i18n } = useTranslation();
  const { myPublisherId } = useMyPublisher();
  const q = useQuery({
    queryKey: ['aux-pioneers', 'serving-now'],
    queryFn: () => auxiliaryPioneersApi.servingNow(),
    staleTime: 60 * 1000,
  });

  if (q.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }
  if (q.error || !q.data) {
    return (
      <View style={styles.centre}>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      </View>
    );
  }

  const { month, people } = q.data;
  const title = capitalizeFirst(monthLabel(i18n.language, month));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text style={styles.month} accessibilityRole="header">
          {title}
        </Text>
        {people.length === 0 ? (
          <Text style={styles.intro}>{t('auxPioneer.noneThisMonth')}</Text>
        ) : (
          <>
            <Text style={styles.intro}>{t('auxPioneer.now.intro')}</Text>
            <View style={styles.list}>
              {people.map((p, i) => (
                <View key={p.publisherId} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(p.name)}</Text>
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.publisherId === myPublisherId ? (
                    <View style={styles.you}>
                      <Text style={styles.youText}>{t('auxPioneer.now.you')}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        )}

        <Pressable
          onPress={() => router.push('/cart/field-service' as never)}
          style={({ pressed }) => [styles.way, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('fieldService.title')}
          accessibilityHint={t('auxPioneer.now.meetingsHint')}
        >
          <View style={styles.wayIcon}>
            <Ionicons name="walk-outline" size={20} color="#0c7c8c" />
          </View>
          <View style={styles.wayBody}>
            <Text style={styles.wayTitle}>{t('fieldService.title')}</Text>
            <Text style={styles.wayHint}>{t('auxPioneer.now.meetingsHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** «Кайзерман Ида» → «КИ». */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const INK = '#0f172a';
const SOFT = '#64748b';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 },
  centre: { flex: 1, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 24, fontFamily: FONT.bold, color: INK, marginTop: 4 },
  intro: { fontSize: 15, lineHeight: 21, fontFamily: FONT.medium, color: SOFT, marginTop: 4, marginBottom: 16 },
  list: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  // The same green circle as on the working list, so the two read as one.
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E1F5EE',
  },
  avatarText: { fontSize: 13, fontFamily: FONT.bold, color: '#085041' },
  name: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: FONT.semibold, color: INK },
  you: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#f1f5f9' },
  youText: { fontSize: 12, fontFamily: FONT.semibold, color: SOFT },
  way: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  pressed: { backgroundColor: '#f8fafc' },
  wayIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2f4',
  },
  wayBody: { flex: 1, minWidth: 0 },
  wayTitle: { fontSize: 15, fontFamily: FONT.semibold, color: INK },
  wayHint: { fontSize: 13, fontFamily: FONT.medium, color: SOFT, marginTop: 1 },
});
