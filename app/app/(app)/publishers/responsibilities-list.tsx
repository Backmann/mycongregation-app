import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { responsibilitiesApi, type PublicResponsibility, type ResponsibilityType } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { RESPONSIBILITY_GROUPS } from '../../../lib/responsibility-groups';
import { FONT } from '../../../lib/typography';
import { LoadFailure } from '../../../components/LoadFailure';

/**
 * Who carries which duty — for everybody.
 *
 * Lionel, 6 October 2026: every duty, assistants included, so that a
 * publisher sees whom to turn to. A duty and a name, in the order the
 * administrator's screen keeps them (lib/responsibility-groups). Nothing to
 * press; no «who appointed him and when» — the server does not send that
 * here; and a duty nobody carries is simply not listed: «Не назначено» is
 * the administrator's to-do, not the congregation's news.
 *
 * The same request the app already makes for everybody to learn its own
 * rights (lib/permissions), under the same key — opening this screen asks
 * the server nothing new.
 */
export default function ResponsibilitiesListScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['responsibilities'],
    queryFn: () => responsibilitiesApi.list(),
    staleTime: 5 * 60 * 1000,
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

  const byType = new Map<ResponsibilityType, PublicResponsibility[]>();
  for (const r of q.data) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  const groups = RESPONSIBILITY_GROUPS.map((g) => ({
    key: g.key,
    types: g.types.filter((type) => (byType.get(type) ?? []).length > 0),
  })).filter((g) => g.types.length > 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text style={styles.intro}>
          {groups.length > 0 ? t('responsibilities.publicSubtitle') : t('responsibilities.noneYet')}
        </Text>
        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupLabel} accessibilityRole="header">
              {t(`responsibilities.groups.${group.key}`)}
            </Text>
            <View style={styles.card}>
              {group.types.map((type, i) => (
                <View key={type} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Text style={styles.role}>{t(`responsibilities.types.${type}`)}</Text>
                  {(byType.get(type) ?? []).map((h) => (
                    <View key={h.userId} style={styles.holder}>
                      <Text style={styles.name}>{h.holderName ?? t('responsibilities.unknownUser')}</Text>
                      {h.userId === user?.id ? (
                        <View style={styles.you}>
                          <Text style={styles.youText}>{t('responsibilities.you')}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const INK = '#0f172a';
const SOFT = '#64748b';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 },
  centre: { flex: 1, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 15, lineHeight: 21, fontFamily: FONT.medium, color: SOFT, marginBottom: 4 },
  group: { marginTop: 16 },
  groupLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: FONT.bold,
    color: SOFT,
    marginBottom: 8,
    marginLeft: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  row: { paddingHorizontal: 14, paddingVertical: 11 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  // The duty small above, the name large below: the eye looks for a duty and
  // leaves with a name.
  role: { fontSize: 13, lineHeight: 18, fontFamily: FONT.medium, color: SOFT },
  holder: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  name: { flexShrink: 1, fontSize: 16, lineHeight: 22, fontFamily: FONT.semibold, color: INK },
  you: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: '#f1f5f9' },
  youText: { fontSize: 12, fontFamily: FONT.semibold, color: SOFT },
});
