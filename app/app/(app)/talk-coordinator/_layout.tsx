import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function TalkCoordinatorLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerLeft: () => <BackButton fallback="/schedule" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('talkCoordinator.title') }}
      />
      <Stack.Screen
        name="log"
        options={{ title: t('talkCoordinator.log.title') }}
      />
      <Stack.Screen
        name="congregations"
        options={{ title: t('talkCoordinator.congregations.title') }}
      />
      <Stack.Screen
        name="speakers"
        options={{ title: t('talkCoordinator.speakers.title') }}
      />
    </Stack>
  );
}
