import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ProfileLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: t('profile.title') }}
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
    </Stack>
  );
}
