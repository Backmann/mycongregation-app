import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { headerOptions } from '../../../lib/header';
import { BackButton } from '../../../components/BackButton';
import { screenGate } from '../../../components/ScreenGate';

export default function AnnouncementsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={headerOptions} screenLayout={screenGate('/announcements')}>
      <Stack.Screen
        name="index"
        options={{
          title: t('announcements.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
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
