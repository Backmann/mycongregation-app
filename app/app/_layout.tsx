import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../lib/auth';
import { initI18nFromStorage } from '../lib/i18n';
import { LanguagePickerModal } from '../components/LanguagePicker';

const queryClient = new QueryClient({
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

  useEffect(() => {
    (async () => {
      const { isFirstLaunch } = await initI18nFromStorage();
      setShowLanguagePrompt(isFirstLaunch);
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <LanguagePickerModal
          visible={showLanguagePrompt}
          onClose={() => setShowLanguagePrompt(false)}
          required
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
