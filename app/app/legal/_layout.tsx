import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function LegalLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0e7490' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('legal.title') }} />
    </Stack>
  );
}
