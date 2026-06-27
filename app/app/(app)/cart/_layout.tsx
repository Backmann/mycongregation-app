import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function CartLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('service.hubTitle') }} />
      <Stack.Screen
        name="witnessing"
        options={{ title: t('service.publicWitnessing') }}
      />
      <Stack.Screen
        name="locations"
        options={{ title: t('service.locations') }}
      />
    </Stack>
  );
}
