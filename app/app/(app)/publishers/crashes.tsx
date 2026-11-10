import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { clientErrorsApi, type ClientErrorRow } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { FONT } from '../../../lib/typography';

/**
 * «Сбои приложения» (10 November 2026): what broke for people in the last
 * thirty days, from the failure journal (lib/crash-report.ts). Technical
 * facts only; the same failure on a day is one row with a count. Admin only
 * (lib/screen-access.ts).
 */

const PLATFORM_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  web: 'globe-outline',
  android: 'logo-android',
  ios: 'logo-apple',
};

function Row({ r }: { r: ClientErrorRow }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const when = new Date(r.lastAt).toLocaleString(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const meta = [
    when,
    t(r.source === 'screen' ? 'crashes.screen' : 'crashes.uncaught'),
    r.role ? t(`profile.roles.${r.role}`, { defaultValue: r.role }) : t('crashes.before'),
    r.appCommit ? t('crashes.build', { id: r.appCommit }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={styles.rowTop}>
        <Ionicons name={PLATFORM_ICON[r.platform] ?? 'help-circle-outline'} size={16} color="#475569" />
        <Text style={styles.route}>{r.route}</Text>
        <View style={styles.count}>
          <Text style={styles.countText}>{t('crashes.times', { count: r.count })}</Text>
        </View>
      </View>
      <Text style={styles.message} selectable>
        {r.message}
      </Text>
      <Text style={styles.meta}>{meta}</Text>
      {open && r.stack ? (
        <View style={styles.stack}>
          <Text style={styles.stackLabel}>{t('crashes.stack')}</Text>
          <Text style={styles.stackText} selectable>
            {r.stack}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function CrashesScreen() {
  const { t } = useTranslation();
  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['client-errors'],
    queryFn: () => clientErrorsApi.list(),
  });
  const rows = q.data ?? [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.note}>{t('crashes.note')}</Text>
      {q.isSuccess && rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={28} color="#15803d" />
          <Text style={styles.emptyText}>{t('crashes.empty')}</Text>
        </View>
      ) : null}
      {rows.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eef1f4' },
  content: { padding: 12, gap: 10, maxWidth: 820, width: '100%', alignSelf: 'center' },
  note: { fontSize: 13.5, lineHeight: 19, fontFamily: FONT.medium, color: '#475569', paddingHorizontal: 4 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 15, fontFamily: FONT.semibold, color: '#334155' },
  row: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, gap: 6 },
  pressed: { opacity: 0.85 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  route: { flex: 1, fontSize: 15, fontFamily: FONT.extrabold, color: '#0f172a' },
  count: { backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontSize: 12.5, fontFamily: FONT.bold, color: '#b91c1c' },
  message: { fontSize: 14, lineHeight: 20, fontFamily: FONT.medium, color: '#334155' },
  meta: { fontSize: 12.5, fontFamily: FONT.semibold, color: '#64748b' },
  stack: { marginTop: 4, backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, gap: 4 },
  stackLabel: { fontSize: 12, fontFamily: FONT.bold, color: '#475569' },
  stackText: { fontSize: 12, lineHeight: 17, fontFamily: FONT.medium, color: '#334155' },
});
