import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';

/**
 * «Нет связи» — said as itself, in the two places it can be met.
 *
 * Until 7 October 2026 the app had one answer to a server it could not
 * reach: the sign-in screen. Which told the person something untrue — that
 * they had been signed out — and asked for a password most people here do
 * not carry in their heads. See lib/session-verdict.ts.
 */

/**
 * Over the app, when somebody IS inside and the server stopped answering: a
 * small pill above the tab bar. It floats rather than pushing the screen
 * down, so nothing jumps under a thumb when the signal comes and goes.
 */
export function ConnectionPill() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, unreachable, retryConnection } = useAuth();
  if (!user || !unreachable) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.pillWrap, { bottom: 56 + insets.bottom + 10 }]}
    >
      <Pressable
        onPress={retryConnection}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel={t('connection.pillLabel')}
      >
        <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
        <Text style={styles.pillText}>{t('connection.pill')}</Text>
        <Text style={styles.pillAction}>{t('connection.retry')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Instead of the app, when nobody is remembered on this device and the
 * server cannot be asked who is signed in. Not «Войти»: nothing says the
 * session is gone, and with no connection a password would not get anybody
 * in either.
 */
export function NoConnectionScreen() {
  const { t } = useTranslation();
  const { retryConnection } = useAuth();
  const [asking, setAsking] = useState(false);
  return (
    <View style={styles.screen}>
      <Ionicons name="cloud-offline-outline" size={44} color="#64748b" />
      <Text style={styles.title} accessibilityRole="header">
        {t('connection.title')}
      </Text>
      <Text style={styles.body}>{t('connection.body')}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
        onPress={() => {
          setAsking(true);
          retryConnection();
          // The answer arrives through the auth state; this only shows that
          // the press was heard.
          setTimeout(() => setAsking(false), 4000);
        }}
        accessibilityRole="button"
      >
        {asking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{t('connection.retry')}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => router.replace('/(auth)/login' as never)}
        hitSlop={8}
        accessibilityRole="link"
      >
        <Text style={styles.link}>{t('connection.toLogin')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#334155',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 15,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pillText: { color: '#fff', fontSize: 13.5 },
  pillAction: {
    color: '#7dd3fc',
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
    backgroundColor: '#f1f5f9',
  },
  title: {
    fontSize: 19,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
    maxWidth: 360,
  },
  button: {
    marginTop: 10,
    minWidth: 180,
    borderRadius: 12,
    backgroundColor: '#0e7490',
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  link: { marginTop: 10, fontSize: 13.5, color: '#0369a1' },
});
