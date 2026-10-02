import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
  ReminderLadder,
} from '../../../lib/api';
import { LoadError } from '../../../components/LoadError';
import { PushState, usePushState } from '../../../lib/push-notifications';
import {
  enableDeviceNotify,
  useDeviceNotify,
} from '../../../lib/notify-device';
import { usePermissions } from '../../../lib/permissions';
import { router } from 'expo-router';
import { notify } from '../../../lib/error-bus';

/**
 * Whether this device is actually receiving anything — and the two things a
 * person can do about it from here: switch it on, and try it.
 *
 * «Уведомления не приходят» used to carry no clue as to why. The screen first
 * learned to say which step failed; it now also offers the step itself. On the
 * site the only switch sat in the profile and this screen merely pointed at
 * it — twelve of twenty-three iPhone users never got there.
 */
function DeviceState() {
  const { t } = useTranslation();
  const state = useDeviceNotify();
  const native: PushState = usePushState();
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const ok = state === 'ok';
  const error =
    native.kind === 'no_token' || native.kind === 'not_registered'
      ? native.error
      : null;
  // What can be done from here: the site can ask the browser; the app can
  // only lead to the phone's settings once the system has said no.
  const canEnable =
    (Platform.OS === 'web' && state === 'off') ||
    (Platform.OS !== 'web' && state === 'denied');

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await enableDeviceNotify();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await meApi.testNotification();
      setResult(
        res.status === 'sent'
          ? t('notifyDevice.test.sent', {
              time: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })
          : res.status === 'no_device'
            ? t('notifyDevice.test.noDevice')
            : t('notifyDevice.test.failed'),
      );
    } catch (err) {
      setResult(extractErrorMessage(err));
    } finally {
      setTesting(false);
    }
  };

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
      <Text style={styles.deviceLine}>{t(`notifyDevice.state.${state}`)}</Text>
      {state === 'not_installed' ? (
        <Text style={styles.deviceReason}>{t('profile.webPush.iosHint')}</Text>
      ) : null}
      {state === 'denied' && Platform.OS === 'web' ? (
        <Text style={styles.deviceReason}>
          {t('notifyDevice.card.deniedWeb')}
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.deviceReason}>
          {t('notificationPrefs.device.reason', { error })}
        </Text>
      ) : null}
      {state === 'no_token' && Platform.OS === 'android' ? (
        <Text style={styles.deviceReason}>
          {t('notificationPrefs.device.androidHint')}
        </Text>
      ) : null}
      {canEnable ? (
        <Pressable
          style={styles.devicePrimary}
          onPress={enable}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.devicePrimaryText}>
              {t(
                Platform.OS === 'web'
                  ? 'notifyDevice.card.enable'
                  : 'notifyDevice.card.openSettings',
              )}
            </Text>
          )}
        </Pressable>
      ) : null}
      {state !== 'checking' ? (
        <Pressable
          style={styles.deviceSecondary}
          onPress={test}
          disabled={testing}
          accessibilityRole="button"
        >
          {testing ? (
            <ActivityIndicator color="#0e7490" />
          ) : (
            <Text style={styles.deviceSecondaryText}>
              {t('notifyDevice.test.button')}
            </Text>
          )}
        </Pressable>
      ) : null}
      {result ? <Text style={styles.deviceReason}>{result}</Text> : null}
    </View>
  );
}

/**
 * How often a person's own assignments are recalled.
 *
 * The full ladder is the default — three, two and one week, three days and
 * the day before — because that is what was asked for (1 October 2026). But a
 * brother with a part nearly every week would hear about them almost nightly,
 * and the usual answer to that is switching notifications off altogether. So
 * he may thin it out himself. There is no «никогда»: the evening before always
 * comes.
 */
function LadderChoice() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me', 'reminder-ladder'],
    queryFn: () => meApi.reminderLadder(),
  });
  const save = useMutation({
    mutationFn: (ladder: ReminderLadder) => meApi.setReminderLadder(ladder),
    onMutate: async (ladder) => {
      await queryClient.cancelQueries({ queryKey: ['me', 'reminder-ladder'] });
      const previous = queryClient.getQueryData<{ ladder: ReminderLadder }>([
        'me',
        'reminder-ladder',
      ]);
      queryClient.setQueryData(['me', 'reminder-ladder'], { ladder });
      return { previous };
    },
    onError: (err, _ladder, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['me', 'reminder-ladder'], context.previous);
      }
      notify(extractErrorMessage(err));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['me', 'reminder-ladder'], data);
    },
  });
  const current = query.data?.ladder ?? 'full';
  const options: { key: ReminderLadder; hint?: string }[] = [
    { key: 'full', hint: t('notifyDevice.ladder.fullHint') },
    { key: 'short' },
  ];

  return (
    <View style={[styles.card, { paddingVertical: 12, gap: 10 }]}>
      <Text style={styles.rowTitle}>{t('notifyDevice.ladder.title')}</Text>
      {options.map((o) => (
        <Pressable
          key={o.key}
          style={styles.radioRow}
          onPress={() => {
            if (o.key !== current) save.mutate(o.key);
          }}
          disabled={!query.data || save.isPending}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === o.key }}
        >
          <Ionicons
            name={current === o.key ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color="#0e7490"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.radioText}>
              {t(`notifyDevice.ladder.${o.key}`)}
            </Text>
            {o.hint ? <Text style={styles.rowSubtitle}>{o.hint}</Text> : null}
          </View>
        </Pressable>
      ))}
      <Text style={styles.rowSubtitle}>{t('notifyDevice.ladder.note')}</Text>
    </View>
  );
}

const CATEGORIES: { key: NotificationCategory; icon: string }[] = [
  { key: 'assignments', icon: 'mic-outline' },
  { key: 'events', icon: 'megaphone-outline' },
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
  const perms = usePermissions();

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

      <LadderChoice />

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

      {perms.isAdmin ? (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            styles.row,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => router.push('/profile/notification-reach' as never)}
          accessibilityRole="button"
        >
          <View style={styles.rowIcon}>
            <Ionicons name="people-outline" size={19} color="#0ea5e9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('notifyDevice.reach.title')}</Text>
            <Text style={styles.rowSubtitle}>
              {t('notifyDevice.reach.rowSub')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
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
  devicePrimary: {
    backgroundColor: '#0e7490',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  devicePrimaryText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  deviceSecondary: {
    borderWidth: 1,
    borderColor: '#0e7490',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  deviceSecondaryText: {
    color: '#0e7490',
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
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
  radioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  radioText: { fontSize: 14.5, color: '#0f172a' },
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
