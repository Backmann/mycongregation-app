import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { extractErrorMessage } from '../lib/api';
import { reportError } from '../lib/error-bus';
import { ErrorToast } from '../components/ErrorToast';
import { ConfirmHost } from '../components/ConfirmHost';
import { AuthProvider } from '../lib/auth';
import i18n, { initI18nFromStorage } from '../lib/i18n';
import { LanguagePickerModal } from '../components/LanguagePicker';
import { useAppFonts } from '../lib/fonts';
import { useSelfApplyingUpdate } from '../lib/self-update';

/**
 * Small SUMMARY endpoints that read a fact somebody else writes.
 *
 * Each of these had the same failure: the screen that saves invalidates the
 * keys IT knows about, while the same fact is read on another screen under a
 * different root. So the CO visit was assigned and the person's home screen
 * kept the old picture for five minutes; the report was filed and the home
 * card still said it was not; the pair went out and the tally did not move.
 * Every one of them was found by sweeping the code, not by anyone noticing —
 * which is exactly the kind of fault that survives.
 *
 * The alternative is naming the sources at every place that saves. This
 * project has lost that game repeatedly, so the list lives HERE, applies to
 * every mutation, and cannot fall out of step with any particular screen.
 *
 * The cost is bounded: invalidateQueries refetches only the queries with a
 * mounted observer and merely marks the rest stale, so a key nobody is
 * looking at costs nothing until it is looked at.
 *
 * What belongs here: a small, cheap, DERIVED endpoint with readers that are
 * not the writer. What does not: full lists (they have their own owners), and
 * anything a single screen both writes and reads — that one refreshes itself.
 */
const DERIVED_SUMMARY_KEYS = [
  ['me', 'assignments'],
  ['reports', 'my-standing'],
  ['co-visit-mine'],
  ['co-visit-field-service'],
  ['co-visit-meetings'],
  ['co-host-stats'],
  ['cart-pairings'],
] as const;

const queryClient = new QueryClient({
  // Every failed change reports itself. Most requests used to fail in silence:
  // the screen just did not move, which reads as a broken app. A screen that
  // shows the failure in place marks its mutation `meta.inlineError` and stays
  // out of the strip, so nothing is said twice.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.inlineError) return;
      reportError(extractErrorMessage(error));
    },
    /**
     * «Мои задания» is refreshed after ANY successful change, in one place.
     *
     * That list is derived from nearly everything — meeting assignments,
     * duties, field-service meetings, the CO visit, cleaning. Naming each
     * source at each of the fifteen-odd places that save one is a game this
     * project has already lost several times over: the microphone appeared
     * late because one branch was forgotten, and the overseer's counts went
     * stale because nobody thought to refresh them at all.
     *
     * One refetch of one small endpoint costs less than a screen that
     * disagrees with the server — and unlike a list of sources, it cannot
     * fall out of date.
     */
    onSuccess: (_data, _vars, _ctx, _mutation) => {
      for (const key of DERIVED_SUMMARY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [showLanguagePrompt, setShowLanguagePrompt] = useState(false);
  const { fontsLoaded } = useAppFonts();
  const { applying } = useSelfApplyingUpdate();

  useEffect(() => {
    (async () => {
      const { isFirstLaunch } = await initI18nFromStorage();
      setShowLanguagePrompt(isFirstLaunch);
      setReady(true);
    })();
  }, []);

  // Service Worker registration for Web Push (web-only). Failures are
  // non-fatal — the app keeps working without push.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((err) => console.warn('SW registration failed:', err));
  }, []);

  if (!ready || !fontsLoaded) return null;
  // A restart into a freshly fetched update, behind a word rather than a blank
  // screen. The alternative was asking a hundred people to open the app twice.
  if (applying) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          backgroundColor: '#0e7490',
        }}
      >
        <ActivityIndicator color="#ffffff" />
        <Text style={{ color: '#e0f2fe', fontSize: 14 }}>
          {i18n.t('update.applying')}
        </Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* White icons everywhere: the header is the brand colour and the
            login screen is dark. Before this the style followed the system,
            so a phone in dark mode painted the icons white over what was then
            a white header and they vanished. */}
        {/* The build now follows the system's light-or-dark setting — that
            line lives in app.json and cannot be changed without rebuilding, so
            it goes in now, once. The app itself keeps rendering its own light
            colours until the palette work is done: a half-dark app, with our
            screens white and the system's dialogs black, would look broken
            rather than unfinished. Removing this override is all a future dark
            theme will need from the native side. */}
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
        <LanguagePickerModal
          visible={showLanguagePrompt}
          onClose={() => setShowLanguagePrompt(false)}
          required
        />
        <ErrorToast />
        <ConfirmHost />
      </AuthProvider>
    </QueryClientProvider>
  );
}
