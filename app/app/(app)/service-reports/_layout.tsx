import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { usePermissions } from '../../../lib/permissions';

export default function ServiceReportsLayout() {
  const { t } = useTranslation();
  const { canViewServiceSummary } = usePermissions();
  return (
    <Stack
      screenOptions={{
        headerLeft: () => <BackButton fallback="/service-reports" />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('reports.title.list'),
          headerLeft: () => null,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {canViewServiceSummary && (
                <Pressable
                  onPress={() => router.push('/service-reports/summary' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                >
                  <Ionicons
                    name="stats-chart-outline"
                    size={22}
                    color="#0ea5e9"
                  />
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/service-reports/activity' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons
                  name="pulse-outline"
                  size={24}
                  color="#0ea5e9"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/service-reports/group' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons
                  name="people-outline"
                  size={24}
                  color="#0ea5e9"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/service-reports/new' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons name="add" size={28} color="#0ea5e9" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: t('reports.title.new') }} />
      <Stack.Screen name="group" options={{ title: t('reports.title.group') }} />
      <Stack.Screen name="summary" options={{ title: 'Сводка за месяц' }} />
      <Stack.Screen name="audit-log" options={{ title: t('reports.title.editHistory') }} />
      <Stack.Screen
        name="publisher-history"
        options={{ title: t('reports.title.publisherHistory') }}
      />
      <Stack.Screen
        name="activity"
        options={{ title: t('reports.title.activity') }}
      />
    </Stack>
  );
}
