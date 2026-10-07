import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { endWelcome, useWelcomePending } from '../lib/welcome';
import { placeLabel, thisPlace } from '../lib/this-place';

/**
 * The one thing a newcomer is shown on their first visit — see lib/welcome.ts.
 *
 * Three facts, in the order they will be needed: where they are signed in
 * (and that the other places are separate), the name they will sign in with
 * next time, and where their own contacts are. Then «Понятно», and it never
 * comes back.
 */
export function WelcomeCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const pending = useWelcomePending(user?.id);
  if (!user || !pending) return null;

  const place = thisPlace();
  // Which of the three the person is NOT in yet — said only where there is a
  // second one on the very same phone, which is where the confusion lives.
  const note =
    place.kind === 'browser' && place.platform === 'ios'
      ? 'iosBrowser'
      : place.kind === 'browser' && place.platform === 'android'
        ? 'androidBrowser'
        : 'other';

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {t('welcome.title')}
      </Text>
      <Text style={styles.body}>
        {t('welcome.youAreIn', {
          place: placeLabel(t, place.platform, place.kind),
        })}{' '}
        {t(`welcome.note.${note}`)}
      </Text>

      {user.loginName ? (
        <View style={styles.nameBox}>
          <Text style={styles.nameLabel}>{t('welcome.loginName')}</Text>
          <Text style={styles.nameValue} selectable>
            {user.loginName}
          </Text>
          <Text style={styles.nameHint}>{t('welcome.loginNameHint')}</Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        onPress={() => router.push('/profile/contacts' as never)}
        accessibilityRole="link"
      >
        <Ionicons name="call-outline" size={17} color="#0369a1" />
        <Text style={styles.linkText}>{t('welcome.contacts')}</Text>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.done, pressed && styles.pressed]}
        onPress={() => void endWelcome(user.id)}
        accessibilityRole="button"
      >
        <Text style={styles.doneText}>{t('welcome.done')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 16,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0c4a6e',
  },
  body: { marginTop: 6, fontSize: 14.5, lineHeight: 21, color: '#334155' },
  nameBox: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  nameLabel: { fontSize: 12, color: '#64748b' },
  nameValue: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  nameHint: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: '#64748b' },
  link: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 14.5,
    color: '#0369a1',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  done: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#0e7490',
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: { opacity: 0.7 },
});
