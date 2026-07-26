import { useMemo } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  extractErrorMessage,
  meApi,
  NotificationCategory,
  NotificationPreferences,
} from '../../../lib/api';
import { LoadError } from '../../../components/LoadError';
import { PushState, usePushState } from '../../../lib/push-notifications';
import { notify } from '../../../lib/error-bus';

/**
 * Whether this device is actually receiving anything.
 *
 * Both ways it can fail used to end in a console warning nobody sees, so
 * «уведомления не приходят» carried no clue as to why. Now the screen says
 * which step failed and what the device reported — the difference between
 * guessing and knowing.
 */
function DeviceState() {
  const { t } = useTranslation();
  const state: PushState = usePushState();

  const ok = state.kind === 'registered';
  const line = {
    idle: t('notificationPrefs.device.idle'),
    unsupported: t('notificationPrefs.device.unsupported'),
    denied: t('notificationPrefs.device.denied'),
    no_token: t('notificationPrefs.device.noToken'),
    not_registered: t('notificationPrefs.device.notRegistered'),
    registered: t('notificationPrefs.device.registered'),
  }[state.kind];

  const error =
    state.kind === 'no_token' || state.kind === 'not_registered'
      ? state.error
      : null;

  return (
    <View style={[styles.deviceCard, ok && styles.deviceCardOk]}>
      <View style={styles.deviceHead}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'alert-circle-outline'}
          size={17}
          color={ok ? '#16a34a' : '#b45309'}
        />
        <Text style={styles.deviceTitle}>
          {t('notificationPrefs.device.title')}
        </Text>
      </View>
      <Text style={styles.deviceLine}>{line}</Text>
      {error ? (
        <Text style={styles.deviceReason}>
          {t('notificationPrefs.device.reason', { error })}
        </Text>
      ) : null}
      {state.kind === 'no_token' && Platform.OS === 'android' ? (
        <Text style={styles.deviceReason}>
          {t('notificationPrefs.device.androidHint')}
        </Text>
      ) : null}
    </View>
  );
}

const CATEGORIES: { key: NotificationCategory; icon: string }[] = [
  { key: 'assignments', icon: 'mic-outline' },
  { key: 'ministry', icon: 'navigate-outline' },
  { key: 'cleaning', icon: 'sparkles-outline' },
  { key: 'reports', icon: 'document-text-outline' },
  { key: 'admin', icon: 'shield-checkmark-outline' },
];

/**
 * What each person hears about.
 *
 * Everything is on until it is switched off — a brother who never opens this
 * screen still learns that he was given a talk. The switches are named after
 * his life in the congregation, not after the parts of the system that send
 * the messages.
 *
 * There is deliberately no «turn everything off» button: the honest way to
 * silence the app entirely is the phone's own settings, and hiding that behind
 * our switch would let someone lose an assignment while believing they had
 * merely turned down the noise.
 */
export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const prefsQuery = useQuery({
    queryKey: ['me', 'notification-preferences'],
    queryFn: () => meApi.notificationPreferences(),
  });

  const setPref = useMutation({
    mutationFn: (vars: { category: NotificationCategory; enabled: boolean }) =>
      meApi.setNotificationPreference(vars.category, vars.enabled),
    // Answer the tap at once; the server's reply replaces the guess.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({
        queryKey: ['me', 'notification-preferences'],
      });
      const previous = queryClient.getQueryData<NotificationPreferences>([
        'me',
        'notification-preferences',
      ]);
      if (previous) {
        queryClient.setQueryData(['me', 'notification-preferences'], {
          ...previous,
          [vars.category]: vars.enabled,
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      // Put the switch back where it was — a setting that silently failed to
      // save is worse than one that visibly refused.
      if (context?.previous) {
        queryClient.setQueryData(
          ['me', 'notification-preferences'],
          context.previous,
        );
      }
      notify(extractErrorMessage(err));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['me', 'notification-preferences'], data);
    },
  });

  const prefs = prefsQuery.data;
  const allOff = useMemo(
    () => !!prefs && CATEGORIES.every((c) => prefs[c.key] === false),
    [prefs],
  );

  if (prefsQuery.isError && !prefs) {
    return <LoadError onRetry={() => prefsQuery.refetch()} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <DeviceState />

      <Text style={styles.hint}>{t('notificationPrefs.hint')}</Text>

      <View style={styles.card}>
        {CATEGORIES.map((c, idx) => (
          <View
            key={c.key}
            style={[styles.row, idx > 0 && styles.rowDivided]}
          >
            <View style={styles.rowIcon}>
              <Ionicons name={c.icon as never} size={19} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {t(`notificationPrefs.categories.${c.key}`)}
              </Text>
              <Text style={styles.rowSubtitle}>
                {t(`notificationPrefs.hints.${c.key}`)}
              </Text>
            </View>
            <Switch
              value={prefs ? prefs[c.key] : true}
              disabled={!prefs || setPref.isPending}
              onValueChange={(value) =>
                setPref.mutate({ category: c.key, enabled: value })
              }
            />
          </View>
        ))}
      </View>

      {allOff ? (
        <Text style={styles.allOff}>{t('notificationPrefs.allOff')}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12 },
  hint: { fontSize: 13, color: '#64748b', lineHeight: 19 },
  deviceCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  deviceCardOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  deviceHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceTitle: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  deviceLine: { fontSize: 13.5, color: '#0f172a' },
  deviceReason: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  rowSubtitle: { fontSize: 12.5, color: '#64748b', marginTop: 1 },
  allOff: {
    fontSize: 13,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
  },
});
