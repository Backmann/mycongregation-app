import { Stack, router } from 'expo-router';
import { headerOptions, HEADER_ICON } from '../../../lib/header';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { useMayOpen } from '../../../lib/useMayOpen';
import { screenGate } from '../../../components/ScreenGate';

export default function ServiceGroupsLayout() {
  const { t } = useTranslation();
  const mayOpen = useMayOpen();
  return (
    <Stack screenOptions={headerOptions} screenLayout={screenGate('/service-groups')}>
      <Stack.Screen
        name="index"
        options={{
          title: t('serviceGroups.title.list'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
          headerRight: mayOpen('/service-groups/new') ? () => (
            <Pressable
              onPress={() => router.push('/service-groups/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color={HEADER_ICON} />
            </Pressable>
          ) : undefined,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t('serviceGroups.title.detail'),
          headerLeft: () => <BackButton fallback="/service-groups" toParent />,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          title: t('serviceGroups.title.new'),
          headerLeft: () => <BackButton fallback="/service-groups" toParent />,
        }}
      />
    </Stack>
  );
}
