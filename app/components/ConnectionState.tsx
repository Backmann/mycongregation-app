import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { sessionVerdict } from '../lib/session-verdict';
import { lineMissing, noAnswer } from '../lib/screen-failure';

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

/** What a screen hands in: the few fields of a query that tell the story. */
interface Asked {
  data: unknown;
  isError: boolean;
  error: unknown;
  dataUpdatedAt: number;
}

/**
 * Is an OLD answer on screen because the new one failed? Then: when it was
 * received (the oldest of them) and whether the server simply was not there.
 */
export function shownFromBefore(
  queries: Asked[],
): { at: number; why: 'offline' | 'failed' | 'updating' } | null {
  const stale = queries.filter((q) => q.isError && q.data !== undefined && q.dataUpdatedAt > 0);
  if (stale.length === 0) return null;
  // A piece kept from before stands in from its first moment — while its own
  // request may still be on the way. Then it is «being updated», not «no
  // connection»: on a Monday with a good signal that line would be untrue.
  const failed = stale.filter((q) => q.error != null);
  return {
    at: Math.min(...stale.map((q) => q.dataUpdatedAt)),
    why:
      failed.length === 0
        ? 'updating'
        : failed.some((q) => sessionVerdict(q.error) === 'unreachable')
          ? 'offline'
          : 'failed',
  };
}

/** «сегодня, 21:40» / «7 октября, 21:40». */
function whenSaid(at: number, lang: string, today: string): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${today}, ${time}`;
  return `${d.toLocaleDateString(lang, { day: 'numeric', month: 'long' })}, ${time}`;
}

/**
 * A line at the top of a screen that shows an answer the server gave EARLIER
 * — kept on this device, or still in memory — because the new one did not
 * come. Says when it is from: in a hall with no signal the programme on
 * screen may be a day old, and the person must be able to tell.
 */
export function KeptNotice({
  queries,
  onRetry,
  style,
}: {
  queries: Asked[];
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t, i18n } = useTranslation();
  const before = shownFromBefore(queries);
  if (!before) return null;
  const when = whenSaid(before.at, i18n.language, t('connection.today'));
  return (
    <View style={[styles.kept, style]} testID="kept-notice">
      <Ionicons name="cloud-offline-outline" size={16} color="#92400e" />
      <Text style={styles.keptText}>
        {t(
          before.why === 'offline'
            ? 'connection.keptOffline'
            : before.why === 'failed'
              ? 'connection.keptFailed'
              : 'connection.keptUpdating',
          { when },
        )}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
          <Text style={styles.keptAction}>{t('connection.refresh')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The line above a contents screen («Служение», «Собрание», «Профиль»).
 *
 * Each row there carries a line from its own request; one that did not come
 * is left out and the row keeps its plain description — honest, but silent:
 * offline the amber «something to do» lines simply were not there, which
 * reads as «nothing waiting» (found 9 October 2026). Now the screen says that not everything is
 * shown, with a way to ask again. When nothing is missing but an EARLIER
 * answer is standing in, it is the usual KeptNotice.
 */
export function PartlyShown({
  queries,
  onRetry,
  style,
}: {
  queries: Asked[];
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const missing = queries.filter(lineMissing);
  if (missing.length === 0) return <KeptNotice queries={queries} onRetry={onRetry} style={style} />;
  const offline = missing.some((q) => noAnswer(q.error));
  return (
    <View style={[styles.kept, style]} testID="partly-shown">
      <Ionicons name="cloud-offline-outline" size={16} color="#92400e" />
      <Text style={styles.keptText}>
        {t(offline ? 'connection.partlyOffline' : 'connection.partlyFailed')}
      </Text>
      <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
        <Text style={styles.keptAction}>{t('connection.retry')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * At the end of a feed shown from an earlier kept piece: what lies beyond is
 * not known without the server — not «the programme ends here».
 */
export function KeptEnd({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.keptEnd} testID="kept-end">
      <Text style={styles.keptEndText}>{t('connection.keptEnd')}</Text>
      <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
        <Text style={styles.keptAction}>{t('connection.refresh')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * In place of a list that did not come and has nothing kept to stand in:
 * said as a failure — never as «нет назначений» or an empty feed, which a
 * person in a hall would take for the truth.
 */
export function LoadFailed({
  onRetry,
  unreachable,
  style,
}: {
  onRetry: () => void;
  unreachable: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.failed, style]} testID="load-failed">
      <Ionicons name="cloud-offline-outline" size={30} color="#64748b" />
      <Text style={styles.failedTitle}>{t('connection.loadFailed')}</Text>
      <Text style={styles.failedBody}>
        {t(unreachable ? 'connection.loadFailedOffline' : 'connection.loadFailedOther')}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.failedButton, pressed && { opacity: 0.8 }]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.failedButtonText}>{t('connection.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  kept: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  keptText: { flex: 1, color: '#78350f', fontSize: 13, lineHeight: 18 },
  keptAction: {
    color: '#0e7490',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  keptEnd: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
  },
  keptEndText: { color: '#64748b', fontSize: 13.5, textAlign: 'center' },
  failed: {
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 24,
    padding: 22,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  failedTitle: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  failedBody: { fontSize: 13.5, lineHeight: 19, color: '#475569', textAlign: 'center', maxWidth: 340 },
  failedButton: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: '#0e7490',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  failedButtonText: { color: '#fff', fontSize: 14.5, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
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
