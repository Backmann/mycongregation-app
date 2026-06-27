import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function CartLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerLeft: () => <BackButton fallback="/cart" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('service.hubTitle'), headerLeft: () => null }}
      />
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
