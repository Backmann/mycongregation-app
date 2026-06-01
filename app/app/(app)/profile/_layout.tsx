import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function ProfileLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerLeft: () => <BackButton fallback="/profile" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('profile.title'), headerLeft: () => null }}
      />
      <Stack.Screen
        name="public-talks"
        options={{ title: t('profile.publicTalks') }}
      />
      <Stack.Screen
        name="public-talks-import"
        options={{ title: t('profile.publicTalksImport') }}
      />
      <Stack.Screen
        name="songs-import"
        options={{ title: 'Импорт песен' }}
      />
      <Stack.Screen
        name="change-password"
        options={{ title: t('profile.changePassword.rowTitle') }}
      />
      <Stack.Screen
        name="admin-users"
        options={{ title: t('profile.userManagement') }}
      />
      <Stack.Screen
        name="responsibilities"
        options={{ title: t('responsibilities.title') }}
      />
      <Stack.Screen
        name="meeting-settings"
        options={{ title: t('meetingSettings.title') }}
      />
    </Stack>
  );
}
