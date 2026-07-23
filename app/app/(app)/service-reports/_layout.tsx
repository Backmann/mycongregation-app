import { Stack, router } from 'expo-router';
import { headerOptions, HEADER_ICON } from '../../../lib/header';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { usePermissions } from '../../../lib/permissions';

export default function ServiceReportsLayout() {
  const { t } = useTranslation();
  const { canViewServiceSummary, isAdmin, isElder } = usePermissions();
  // The feed is an elders' tool: the server only serves it to admins and
  // elders, so anyone else used to tap the icon and meet a raw API error.
  const canViewActivityFeed = isAdmin || isElder;
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        headerLeft: () => <BackButton fallback="/service-reports" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('reports.title.list'),
          headerLeft: () => <BackButton fallback="/cart" toParent />,
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
                    color={HEADER_ICON}
                  />
                </Pressable>
              )}
              {/* The annual congregation report is the secretary's own
                  document and names people, so it is not shown to everyone
                  the way attendance is. */}
              {canViewServiceSummary && (
                <Pressable
                  onPress={() => router.push('/service-reports/annual' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                >
                  <Ionicons
                    name="clipboard-outline"
                    size={22}
                    color={HEADER_ICON}
                  />
                </Pressable>
              )}
              {/* Attendance sits with the reports because it goes to the
                  circuit overseer like they do. Open to any member: the
                  figures are about the meeting, not about a person. */}
              <Pressable
                onPress={() =>
                  router.push('/service-reports/attendance' as any)
                }
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons
                  name="people-circle-outline"
                  size={24}
                  color={HEADER_ICON}
                />
              </Pressable>
              {canViewActivityFeed && (
                <Pressable
                  onPress={() => router.push('/service-reports/activity' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                >
                  <Ionicons name="pulse-outline" size={24} color={HEADER_ICON} />
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/service-reports/group' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons
                  name="people-outline"
                  size={24}
                  color={HEADER_ICON}
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/service-reports/new' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons name="add" size={28} color={HEADER_ICON} />
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
          <Stack.Screen
        name="attendance"
        options={{ title: t('attendance.pageTitle') }}
      />
      <Stack.Screen
        name="annual"
        options={{ title: t('annualReport.pageTitle') }}
      />
</Stack>
  );
}
