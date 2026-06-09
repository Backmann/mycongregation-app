import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { useAuth } from '../../../lib/auth';

export default function ServiceGroupsLayout() {
  const { t } = useTranslation();
  const isAdmin = useAuth().user?.role === 'admin';
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('serviceGroups.title.list'),
          headerRight: isAdmin ? () => (
            <Pressable
              onPress={() => router.push('/service-groups/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color="#0ea5e9" />
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
