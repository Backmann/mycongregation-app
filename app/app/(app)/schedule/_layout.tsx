import { Stack, router } from 'expo-router';
import {
  headerOptions,
  HEADER_ICON,
  HEADER_MARK,
  headerTitleText,
} from '../../../lib/header';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';
import { HeaderMenu } from '../../../components/HeaderMenu';
import { usePermissions } from '../../../lib/permissions';

export default function ScheduleLayout() {
  const { t } = useTranslation();
  const {
    canEditMidweekSchedule,
    canEditWeekendSchedule,
    canImportMidweekSchedule,
    canImportWeekendSchedule,
    canViewLocalNeeds,
  } = usePermissions();
  const canCreate = canEditMidweekSchedule || canEditWeekendSchedule;
  const canImport = canImportMidweekSchedule || canImportWeekendSchedule;
  // «Составление программы» is offered to exactly those the Congregation tab
  // offers it to (publishers/index.tsx): who edits or who imports.
  const plans = canCreate || canImport;
  // On a narrow viewport (a phone with a larger display-size setting, or a
  // zoomed-in browser) header icons leave too little room for the title — so
  // shrink the icons and the brand mark, and keep the title on one line
  // whatever the font scale.
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const iconSize = compact ? 21 : 24;
  const iconPad = compact ? 5 : 8;
  const title = ({ children }: { children: string }) => (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.2}
      // Drawn here to shrink on narrow phones; it takes the shared style and
      // overrides only the size.
      style={[headerTitleText, { fontSize: compact ? 16 : 18 }]}
    >
      {children}
    </Text>
  );

  /**
   * THE PROGRAMME TAB IS THE FEED (23 September). The old screen of weeks and
   * parts is «Составление программы» at /schedule/edit — for those who build
   * the programme. What used to be five icons here is now: the events, and
   * for those who plan, the way to planning. One of them shows as its own
   * icon, two go behind «…» (components/HeaderMenu).
   */
  const events = {
    key: 'events',
    icon: 'megaphone-outline' as const,
    title: t('specialEvents.title.list'),
    subtitle: t('schedule.menu.eventsSub'),
    tint: '#7c3aed',
    tintBg: '#ede9fe',
    onPress: () => router.push('/special-events' as any),
  };
  const feedMenu = [
    events,
    ...(plans
      ? [
          {
            key: 'edit',
            icon: 'create-outline' as const,
            title: t('congregationHub.programme'),
            subtitle: t('congregationHub.sub.programme'),
            tint: '#b45309',
            tintBg: '#fef3c7',
            onPress: () => router.push('/schedule/edit' as any),
          },
        ]
      : []),
  ];
  // Planning keeps «+» as an icon — it is used all the time — and puts the
  // rest behind «…». The talk coordinator has its own row in the Congregation
  // tab, for the same people, so its icon is gone from here.
  const editMenu = [
    ...(canCreate
      ? [
          {
            key: 'rules',
            icon: 'options-outline' as const,
            title: t('schedule.title.rules'),
            subtitle: t('schedule.menu.rulesSub'),
            onPress: () => router.push('/schedule/rules' as any),
          },
        ]
      : []),
    ...(canImport
      ? [
          {
            key: 'import',
            icon: 'cloud-upload-outline' as const,
            title: t('schedule.title.import'),
            subtitle: t('profileExtra.mwbImportSub'),
            onPress: () => router.push('/schedule/import' as any),
          },
        ]
      : []),
    ...(canViewLocalNeeds
      ? [
          {
            key: 'localNeeds',
            icon: 'bulb-outline' as const,
            title: t('schedule.a11y.localNeeds'),
            subtitle: t('schedule.menu.localNeedsSub'),
            onPress: () => router.push('/local-needs' as any),
          },
        ]
      : []),
  ];

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('tabs.schedule'),
          headerTitle: title,
          headerLeft: () => (
            <View
              style={{
                paddingLeft: compact ? 8 : 12,
                paddingRight: compact ? 2 : 6,
              }}
            >
              <BrandLockup mark={HEADER_MARK} markOnly tone="dark" />
            </View>
          ),
          headerRight: () => (
            <HeaderMenu
              title={t('tabs.schedule')}
              items={feedMenu}
              color={HEADER_ICON}
              iconSize={iconSize}
              pad={iconPad}
            />
          ),
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          title: t('congregationHub.programme'),
          headerTitle: title,
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {canCreate && (
                <Pressable
                  onPress={() => router.push('/schedule/new' as any)}
                  style={{ paddingHorizontal: iconPad }}
                  hitSlop={8}
                  accessibilityLabel={t('schedule.a11y.newAssignment')}
                >
                  <Ionicons name="add" size={iconSize} color={HEADER_ICON} />
                </Pressable>
              )}
              <HeaderMenu
                title={t('congregationHub.programme')}
                items={editMenu}
                color={HEADER_ICON}
                iconSize={iconSize}
                pad={iconPad}
              />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t('schedule.title.detail'),
          headerLeft: () => <BackButton fallback="/schedule/edit" toParent />,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          title: t('schedule.title.new'),
          headerLeft: () => <BackButton fallback="/schedule/edit" toParent />,
        }}
      />
      {/* The feed's old address — forwards to /schedule. */}
      <Stack.Screen name="feed" options={{ headerShown: false }} />
      <Stack.Screen
        name="conduct"
        options={{
          title: t('conduct.title'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
        }}
      />
      <Stack.Screen
        name="rules"
        options={{
          title: t('schedule.title.rules'),
          headerLeft: () => <BackButton fallback="/schedule/edit" toParent />,
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          title: t('schedule.title.import'),
          headerLeft: () => <BackButton fallback="/schedule/edit" toParent />,
        }}
      />
    </Stack>
  );
}
