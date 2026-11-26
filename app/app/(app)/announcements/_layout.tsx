import { Stack, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { headerOptions, HEADER_ICON } from '../../../lib/header';
import { useMayOpen } from '../../../lib/useMayOpen';
import { BackButton } from '../../../components/BackButton';
import { screenGate } from '../../../components/ScreenGate';

export default function AnnouncementsLayout() {
  const { t } = useTranslation();
  const mayOpen = useMayOpen();
  return (
    <Stack screenOptions={headerOptions} screenLayout={screenGate('/announcements')}>
      <Stack.Screen
        name="index"
        options={{
          title: t('announcements.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
          headerRight: mayOpen('/announcements/templates')
            ? () => (
                <Pressable
                  onPress={() => router.push('/announcements/templates' as never)}
                  style={{ paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' }}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: HEADER_ICON }}>
                    {t('announcements.templates.open')}
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.Screen
        name="templates"
        options={{
          title: t('announcements.templates.screenTitle'),
          headerLeft: () => <BackButton fallback="/announcements" />,
        }}
      />
      <Stack.Screen
        name="meeting"
        options={{
          title: t('announcements.read.screenTitle'),
          headerLeft: () => <BackButton fallback="/home" toParent />,
        }}
      />
    </Stack>
  );
}
