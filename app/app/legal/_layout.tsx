import { Stack } from 'expo-router';
import { headerOptions } from '../../lib/header';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../components/BackButton';

export default function LegalLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        headerLeft: () => <BackButton fallback="/" color="#ffffff" />,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('legal.title') }} />
    </Stack>
  );
}
