import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';
import { usePermissions } from '../../../lib/permissions';

export default function PublishersLayout() {
  const { t } = useTranslation();
  const { canEditPublishers, canManageAbsences } = usePermissions();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('publishers.title.list'),
          headerLeft: () => (
            <View style={{ paddingLeft: 12, paddingRight: 6 }}>
              <BrandLockup mark={26} markOnly />
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/service-groups' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
                accessibilityLabel={t('tabs.groups')}
              >
                <Ionicons name="grid-outline" size={22} color="#0ea5e9" />
              </Pressable>
              {canManageAbsences && (
                <Pressable
                  onPress={() => router.push('/absences' as any)}
                  style={{ paddingHorizontal: 10 }}
                  hitSlop={8}
                  accessibilityLabel={t('absences.title.list')}
                >
                  <Ionicons name="airplane-outline" size={22} color="#0ea5e9" />
                </Pressable>
              )}
              {canEditPublishers && (
                <Pressable
                  onPress={() => router.push('/publishers/new' as any)}
                  style={{ paddingHorizontal: 10 }}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={28} color="#0ea5e9" />
                </Pressable>
              )}
            </View>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{
          title: t('publishers.title.detail'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }} />
      <Stack.Screen
        name="new"
        options={{
          title: t('publishers.title.new'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
    </Stack>
  );
}
