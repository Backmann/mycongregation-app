import { Stack, router } from 'expo-router';
import { headerOptions } from '../../../lib/header';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
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
  // A full admin gets six header actions. On a narrow viewport (a phone with a
  // larger display-size setting, or a zoomed-in browser) they leave too little
  // room for the title, which then collides with them — so shrink the icons and
  // the brand mark, and keep the title on one line whatever the font scale.
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const iconSize = compact ? 21 : 24;
  const iconPad = compact ? 5 : 8;
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('schedule.title.list'),
          headerTitle: ({ children }) => (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              style={{
                fontSize: compact ? 16 : 18,
                fontWeight: '700',
                color: '#0f172a',
              }}
            >
              {children}
            </Text>
          ),
          headerLeft: () => (
            <View
              style={{
                paddingLeft: compact ? 8 : 12,
                paddingRight: compact ? 2 : 6,
              }}
            >
              <BrandLockup mark={compact ? 22 : 26} markOnly />
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {canViewLocalNeeds && (
                <Pressable
                  onPress={() => router.push('/local-needs' as any)}
                  style={{ paddingHorizontal: iconPad }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.localNeeds')}
                >
                  <Ionicons name="bulb-outline" size={iconSize} color="#0ea5e9" />
                </Pressable>
              )}
              {canCoordinatePublicTalks && (
                <Pressable
                  onPress={() => router.push('/talk-coordinator' as any)}
                  style={{ paddingHorizontal: iconPad }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.talkCoordinator')}
                >
                  <Ionicons name="mic-outline" size={iconSize} color="#0ea5e9" />
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/special-events' as any)}
                style={{ paddingHorizontal: iconPad }}
                hitSlop={8}
                accessibilityLabel={t('schedule.a11y.events')}
              >
                <Ionicons name="megaphone-outline" size={iconSize} color="#0ea5e9" />
              </Pressable>
              {canImport && (
                <Pressable
                  onPress={() => router.push('/schedule/import' as any)}
                  style={{ paddingHorizontal: iconPad }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.importEpub')}
                >
                  <Ionicons name="cloud-upload-outline" size={iconSize} color="#0ea5e9" />
                </Pressable>
              )}
              {canCreate && (
                <Pressable
                  onPress={() => router.push('/schedule/rules' as any)}
                  style={{ paddingHorizontal: iconPad }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.rules')}
                >
                  <Ionicons name="options-outline" size={iconSize} color="#0ea5e9" />
                </Pressable>
              )}
              {canCreate && (
                <Pressable
                  onPress={() => router.push('/schedule/new' as any)}
                  style={{ paddingHorizontal: iconPad }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.newAssignment')}
                >
                  <Ionicons name="add" size={iconSize} color="#0ea5e9" />
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
