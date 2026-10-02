import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { meApi } from '../lib/api';
import { enableDeviceNotify, useDeviceNotify } from '../lib/notify-device';
import { isAndroidBrowser } from '../lib/web-push';
import { storage } from '../lib/storage';

const SNOOZE_KEY = 'notify-card-snooze-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const INSTALL_URL = 'https://mycongregation.org/app/';

/**
 * «Включите уведомления» — on the home screen, for a device that receives
 * nothing.
 *
 * On 1 October 2026 a third of the people who used the app had no device
 * registered. Nothing was broken: the site's notifications were switched on
 * by one toggle in the profile, and nobody was ever shown it. The phone app
 * asks by itself at sign-in and every one of its users was registered — so the
 * site now asks too, where it will be seen.
 *
 * What it says depends on what the person can actually do on this device: an
 * iPhone in Safari cannot switch anything on until the site is on the Home
 * Screen, and saying «включите» there would be an instruction nobody can
 * follow.
 *
 * «Позже» hides it for a week, not for ever: a card that can be dismissed for
 * good is a card that has been dismissed for good by exactly the people it is
 * for.
 */
export function EnableNotificationsCard() {
  const { t } = useTranslation();
  const state = useDeviceNotify();
  const [snoozed, setSnoozed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage
      .getItem(SNOOZE_KEY)
      .then((raw) => {
        if (!cancelled) setSnoozed(!!raw && Number(raw) > Date.now());
      })
      .catch(() => {
        if (!cancelled) setSnoozed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const later = () => {
    setSnoozed(true);
    void storage
      .setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
      .catch(() => undefined);
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await enableDeviceNotify();
      if (next === 'ok') {
        setDone(true);
        // The proof that it worked is a notification, not our word for it.
        meApi.testNotification().catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={[s.card, s.ok]}>
        <View style={s.head}>
          <Ionicons name="checkmark-circle" size={20} color="#16794f" />
          <Text style={s.title}>{t('notifyDevice.card.doneTitle')}</Text>
        </View>
        <Text style={s.body}>{t('notifyDevice.card.doneBody')}</Text>
        <Pressable
          style={s.quiet}
          onPress={() => setDone(false)}
          accessibilityRole="button"
        >
          <Text style={s.quietText}>{t('common.ok')}</Text>
        </Pressable>
      </View>
    );
  }

  if (snoozed !== false) return null;
  if (state !== 'off' && state !== 'denied' && state !== 'not_installed') {
    return null;
  }

  const Later = (
    <Pressable style={s.quiet} onPress={later} accessibilityRole="button">
      <Text style={s.quietText}>{t('notifyDevice.card.later')}</Text>
    </Pressable>
  );

  if (state === 'not_installed') {
    return (
      <View style={s.card}>
        <View style={s.head}>
          <Ionicons name="notifications-outline" size={20} color="#b45309" />
          <Text style={s.title}>{t('notifyDevice.card.iosTitle')}</Text>
        </View>
        <Text style={s.body}>{t('notifyDevice.card.iosBody')}</Text>
        {[1, 2, 3].map((n) => (
          <Text key={n} style={s.step}>
            {n}. {t(`notifyDevice.card.iosStep${n}`)}
          </Text>
        ))}
        {Later}
      </View>
    );
  }

  if (state === 'denied') {
    const native = Platform.OS !== 'web';
    return (
      <View style={s.card}>
        <View style={s.head}>
          <Ionicons
            name="notifications-off-outline"
            size={20}
            color="#b45309"
          />
          <Text style={s.title}>{t('notifyDevice.card.deniedTitle')}</Text>
        </View>
        <Text style={s.body}>
          {t(native ? 'notifyDevice.card.deniedApp' : 'notifyDevice.card.deniedWeb')}
        </Text>
        {native ? (
          <Pressable
            style={s.primary}
            onPress={enable}
            accessibilityRole="button"
          >
            <Text style={s.primaryText}>
              {t('notifyDevice.card.openSettings')}
            </Text>
          </Pressable>
        ) : null}
        {Later}
      </View>
    );
  }

  const android = isAndroidBrowser();
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Ionicons name="notifications-outline" size={20} color="#b45309" />
        <Text style={s.title}>{t('notifyDevice.card.title')}</Text>
      </View>
      <Text style={s.body}>
        {t(android ? 'notifyDevice.card.androidBody' : 'notifyDevice.card.body')}
      </Text>
      {android ? (
        <Pressable
          style={s.primary}
          onPress={() => void Linking.openURL(INSTALL_URL)}
          accessibilityRole="link"
        >
          <Text style={s.primaryText}>{t('notifyDevice.card.install')}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={android ? s.secondary : s.primary}
        onPress={enable}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={android ? '#0e7490' : '#fff'} />
        ) : (
          <Text style={android ? s.secondaryText : s.primaryText}>
            {t(
              android
                ? 'notifyDevice.card.enableBrowser'
                : 'notifyDevice.card.enable',
            )}
          </Text>
        )}
      </Pressable>
      {Later}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  ok: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  body: { fontSize: 14, color: '#475569', lineHeight: 20 },
  step: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  primary: {
    backgroundColor: '#0e7490',
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  secondary: {
    borderWidth: 1,
    borderColor: '#0e7490',
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#0e7490',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  quiet: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  quietText: { color: '#64748b', fontSize: 14 },
});
