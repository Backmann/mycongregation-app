import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';

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
        options={{
          title: t('service.hubTitle'),
          headerLeft: () => (
            <View style={{ paddingLeft: 12, paddingRight: 6 }}>
              <BrandLockup mark={26} markOnly />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="witnessing"
        options={{ title: t('service.publicWitnessing') }}
      />
      <Stack.Screen
        name="locations"
        options={{ title: t('service.locations') }}
      />
      <Stack.Screen
        name="co-schedule"
        options={{ title: t('coVisit.title') }}
      />
      <Stack.Screen
        name="field-service"
        options={{ title: t('fieldService.title') }}
      />
    </Stack>
  );
}
