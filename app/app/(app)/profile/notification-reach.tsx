import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Redirect } from 'expo-router';
import { NotificationReachRow, notificationsApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { LoadError } from '../../../components/LoadError';
import { failsScreen } from '../../../lib/screen-failure';

/**
 * Who the congregation's notifications reach — and why not the rest.
 *
 * «Брату не пришло» could be answered, until now, only by a query against the
 * database. The list is ordered the way one would go and speak to people:
 * whoever cannot be reached and has a part coming is at the top, and each line
 * says the cause in words that tell what to do about it.
 *
 * For an administrator only: it names people and what their devices do.
 */
export default function NotificationReachScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const query = useQuery({
    throwOnError: failsScreen,
    queryKey: ['notifications', 'reach'],
    queryFn: () => notificationsApi.reach(),
    enabled: perms.isAdmin,
  });

  if (!perms.isAdmin) return <Redirect href="/profile" />;
  if (query.isError && !query.data) {
    return <LoadError onRetry={() => query.refetch()} />;
  }
  const data = query.data;
  if (!data) return <View style={s.container} />;

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
    });

  const platformOf = (r: NotificationReachRow): string | null => {
    if (!r.platform) return null;
    const key = `${r.platform}_${r.clientKind ?? 'browser'}`;
    const known = [
      'android_app',
      'android_browser',
      'ios_browser',
      'ios_app',
      'mac_browser',
      'windows_browser',
    ];
    // A device we cannot name says nothing worth a line of its own.
    return known.includes(key) ? t(`notifyDevice.reach.platform.${key}`) : null;
  };

  const lineOf = (r: NotificationReachRow): string => {
    const parts: string[] = [];
    if (r.reason) {
      parts.push(t(`notifyDevice.reach.reasons.${r.reason}`));
      // The device matters only where it explains the cause.
      const platform = platformOf(r);
      if (platform && r.reason !== 'no_login' && r.reason !== 'never_opened') {
        parts.push(platform);
      }
    } else {
      const platform = platformOf(r);
      if (platform) parts.push(platform);
    }
    if (r.upcoming > 0) {
      parts.push(t('notifyDevice.reach.upcoming', { count: r.upcoming }));
    }
    if (r.lastTest) {
      parts.push(
        t(
          r.lastTest.status === 'sent'
            ? 'notifyDevice.reach.lastTest'
            : 'notifyDevice.reach.lastTestFailed',
          { date: day(r.lastTest.at) },
        ),
      );
    }
    return parts.join(' · ');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.summary}>
        <Text style={s.summaryTitle}>
          {t('notifyDevice.reach.summary', {
            receiving: data.receiving,
            total: data.total,
          })}
        </Text>
        <Text style={s.summarySub}>
          {data.unreachable === 0
            ? t('notifyDevice.reach.allGood')
            : t('notifyDevice.reach.summaryRest', {
                count: data.unreachable,
                parts: data.unreachableWithParts,
              })}
        </Text>
      </View>

      <View style={s.card}>
        {data.rows.map((r, idx) => (
          <View key={r.publisherId} style={[s.row, idx > 0 && s.rowDivided]}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{r.displayName}</Text>
              <Text style={s.line}>{lineOf(r)}</Text>
            </View>
            <View style={[s.pill, r.receives ? s.pillOk : s.pillNo]}>
              <Text
                style={[s.pillText, r.receives ? s.pillTextOk : s.pillTextNo]}
              >
                {t(r.receives ? 'notifyDevice.reach.yes' : 'notifyDevice.reach.no')}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12 },
  summary: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  summarySub: { fontSize: 13.5, color: '#64748b', lineHeight: 19 },
  card: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  name: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  line: { fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 17 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  pillOk: { backgroundColor: '#dcfce7' },
  pillNo: { backgroundColor: '#fee2e2' },
  pillText: { fontSize: 11.5, fontWeight: '600' },
  pillTextOk: { color: '#166534' },
  pillTextNo: { color: '#b91c1c' },
});
