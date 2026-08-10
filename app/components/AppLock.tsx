import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import {
  askForFingerprint,
  hasRealBiometrics,
  lockEnabled,
  RELOCK_AFTER_MS,
} from '../lib/biometrics';

/**
 * The lock over the signed-in app, and the cover over its back.
 *
 * TWO different jobs in one place, because they share the same knowledge of
 * when the app went away:
 *
 *   The LOCK asks for a fingerprint at a cold start and after five minutes in
 *   the background. Five was Lionel's number, and it is the right shape: long
 *   enough to answer a message and come back, short enough that a phone left on
 *   a table goes quiet.
 *
 *   The COVER hides the content the moment the app leaves the foreground —
 *   Android paints that last frame into the task list, where names and phone
 *   numbers would sit in plain view of anybody who picks the phone up. It
 *   flickers slightly on every switch, and that is the price we agreed to pay.
 *
 * «Войти паролем» is not a decoration. A cut finger, a scanner that refuses, a
 * device whose enrolment was removed — without a way out the person is locked
 * OUT of an app he is signed IN to, and the only remedy would be a telephone
 * call. So the way out signs him out properly and returns him to the form.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();

  const [armed, setArmed] = useState<boolean | null>(null);
  const [byFinger, setByFinger] = useState(true);
  const [locked, setLocked] = useState(false);
  const [asking, setAsking] = useState(false);
  const [covered, setCovered] = useState(false);
  const leftAt = useRef<number | null>(null);

  // Whether this device wants the lock at all — read once, and again whenever
  // the app returns, since the switch may have just been thrown in Profile.
  const readSetting = useCallback(async () => {
    const on = await lockEnabled();
    setArmed(on);
    return on;
  }, []);

  useEffect(() => {
    void (async () => {
      const on = await readSetting();
      setByFinger(await hasRealBiometrics());
      if (on) setLocked(true);
    })();
  }, [readSetting]);

  const unlock = useCallback(async () => {
    setAsking(true);
    const ok = await askForFingerprint(
      byFinger ? t('lock.prompt') : t('lock.promptCode'),
    );
    setAsking(false);
    if (ok) setLocked(false);
  }, [t, byFinger]);

  // Ask as soon as the lock screen appears, so the usual case is one glance and
  // a thumb rather than a tap and then a thumb.
  useEffect(() => {
    if (locked && !asking) void unlock();
    // Only when the lock first goes up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') {
        setCovered(true);
        leftAt.current = Date.now();
        return;
      }
      setCovered(false);
      void (async () => {
        const on = await readSetting();
        const away = leftAt.current ? Date.now() - leftAt.current : 0;
        leftAt.current = null;
        if (on && away > RELOCK_AFTER_MS) setLocked(true);
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [readSetting]);

  if (armed === null) return <>{children}</>;

  return (
    <View style={{ flex: 1 }}>
      {children}
      {(locked || covered) && armed ? (
        <View style={styles.veil}>
          <Ionicons name="lock-closed-outline" size={40} color="#e0f2fe" />
          {locked ? (
            <>
              <Text style={styles.title}>{t('lock.title')}</Text>
              {asking ? (
                <ActivityIndicator color="#e0f2fe" />
              ) : (
                <Pressable style={styles.primary} onPress={() => void unlock()}>
                  <Text style={styles.primaryText}>
                    {byFinger ? t('lock.retry') : t('lock.retryCode')}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={() => void signOut()} hitSlop={8}>
                <Text style={styles.escape}>{t('lock.usePassword')}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  title: {
    color: '#ffffff',
    fontSize: 17,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  primary: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  primaryText: {
    color: '#0e7490',
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  escape: { color: '#bae6fd', fontSize: 14, marginTop: 4 },
});
