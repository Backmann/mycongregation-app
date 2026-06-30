import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';
import { usePermissions } from '../../../lib/permissions';

export default function ScheduleLayout() {
  const { t } = useTranslation();
  const {
    canImportMidweekSchedule,
    canImportWeekendSchedule,
    canEditMidweekSchedule,
    canEditWeekendSchedule,
    canViewLocalNeeds,
    canCoordinatePublicTalks,
  } = usePermissions();
  const canImport = canImportMidweekSchedule || canImportWeekendSchedule;
  const canCreate = canEditMidweekSchedule || canEditWeekendSchedule;
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('schedule.title.list'),
          headerLeft: () => (
            <View style={{ paddingLeft: 12, paddingRight: 6 }}>
              <BrandLockup mark={26} markOnly />
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {canViewLocalNeeds && (
                <Pressable
                  onPress={() => router.push('/local-needs' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.localNeeds')}
                >
                  <Ionicons name="bulb-outline" size={24} color="#0ea5e9" />
                </Pressable>
              )}
              {canCoordinatePublicTalks && (
                <Pressable
                  onPress={() => router.push('/talk-coordinator' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.talkCoordinator')}
                >
                  <Ionicons name="mic-outline" size={24} color="#0ea5e9" />
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/special-events' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
                accessibilityLabel={t('schedule.a11y.events')}
              >
                <Ionicons name="megaphone-outline" size={24} color="#0ea5e9" />
              </Pressable>
              {canImport && (
                <Pressable
                  onPress={() => router.push('/schedule/import' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.importEpub')}
                >
                  <Ionicons name="cloud-upload-outline" size={24} color="#0ea5e9" />
                </Pressable>
              )}
              {canCreate && (
                <Pressable
                  onPress={() => router.push('/schedule/rules' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.rules')}
                >
                  <Ionicons name="options-outline" size={24} color="#0ea5e9" />
                </Pressable>
              )}
              {canCreate && (
                <Pressable
                  onPress={() => router.push('/schedule/new' as any)}
                  style={{ paddingHorizontal: 8 }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.newAssignment')}
                >
                  <Ionicons name="add" size={24} color="#0ea5e9" />
                </Pressable>
              )}
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t('schedule.title.detail'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          title: t('schedule.title.new'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
        }}
      />
      <Stack.Screen
        name="rules"
        options={{
          title: t('schedule.title.rules'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          title: t('schedule.title.import'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
        }}
      />
    </Stack>
  );
}
