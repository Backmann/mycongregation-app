import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../components/BackButton';

export default function LegalLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0e7490' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
        headerLeft: () => <BackButton fallback="/" color="#ffffff" />,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('legal.title') }} />
    </Stack>
  );
}
