import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';

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
        options={{
          title: t('profile.title'),
          headerLeft: () => (
            <View style={{ paddingLeft: 12, paddingRight: 6 }}>
              <BrandLockup mark={26} markOnly />
            </View>
          ),
        }}
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
      <Stack.Screen name="backups" options={{ title: t('backups.title') }} />
      <Stack.Screen
        name="delete-account"
        options={{ title: t('deleteAccount.title') }}
      />
      <Stack.Screen
        name="admin-users"
        options={{ title: t('profile.userManagement') }}
      />
      <Stack.Screen
        name="responsibilities"
        options={{ title: t('responsibilities.title') }}
      />
      <Stack.Screen name="brothers" options={{ title: 'Братья' }} />
      <Stack.Screen
        name="meeting-settings"
        options={{ title: t('meetingSettings.title') }}
      />
      <Stack.Screen
        name="halls"
        options={{ title: t('halls.title') }}
      />
      <Stack.Screen
        name="circuit-overseer"
        options={{ title: t('profile.circuitOverseer') }}
      />
    </Stack>
  );
}
