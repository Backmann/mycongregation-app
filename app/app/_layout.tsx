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
      void queryClient.invalidateQueries({ queryKey: ['me', 'assignments'] });
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
