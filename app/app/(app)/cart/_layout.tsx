import { router, Stack } from 'expo-router';
import { headerOptions, HEADER_MARK } from '../../../lib/header';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';

export default function CartLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        headerLeft: () => <BackButton fallback="/cart" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('service.hubTitle'),
          headerLeft: () => (
            <View style={{ paddingLeft: 12, paddingRight: 6 }}>
              <BrandLockup mark={HEADER_MARK} markOnly tone="dark" />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="witnessing"
        options={{
          title: t('service.publicWitnessing'),
          // The places are part of this, not a neighbour of it: a cart stands
          // somewhere, and the list of somewheres has no life of its own. It
          // keeps its own address so nothing that already points at it breaks
          // — it simply stops being offered as a separate errand.
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/cart/locations' as never)}
              hitSlop={10}
              accessibilityLabel={t('service.locations')}
            >
              <Ionicons name="location-outline" size={22} color="#fff" />
            </Pressable>
          ),
        }}
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
        name="service-overseer"
        options={{ title: t('serviceOverseer.title') }}
      />
      <Stack.Screen
        name="field-service"
        options={{ title: t('fieldService.title') }}
      />
      <Stack.Screen
        name="auxiliary-pioneers"
        options={{ title: t('auxPioneer.title') }}
      />
    </Stack>
  );
}
