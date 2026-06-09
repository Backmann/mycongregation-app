import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { usePermissions } from '../../../lib/permissions';

export default function SpecialEventsLayout() {
  const { t } = useTranslation();
  const { canManageEvents } = usePermissions();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('specialEvents.title.list'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
          headerRight: canManageEvents
            ? () => (
                <Pressable
                  onPress={() => router.push('/special-events/new' as any)}
                  style={{ paddingHorizontal: 10 }}
                  hitSlop={8}
                  accessibilityLabel={t('specialEvents.actions.create')}
                >
                  <Ionicons name="add" size={28} color="#0ea5e9" />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t('specialEvents.title.detail'),
          headerLeft: () => <BackButton fallback="/special-events" toParent />,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          title: t('specialEvents.title.new'),
          headerLeft: () => <BackButton fallback="/special-events" toParent />,
        }}
      />
    </Stack>
  );
}
