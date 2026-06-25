import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function TalkCoordinatorLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerLeft: () => <BackButton fallback="/talk-coordinator" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('talkCoordinator.title'),
          headerLeft: () => <BackButton fallback="/home" toParent />,
        }}
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
      <Stack.Screen
        name="speaker-profile/[id]"
        options={{ title: t('talkCoordinator.speakerProfile.title') }}
      />
      <Stack.Screen
        name="our-speaker-profile/[id]"
        options={{ title: t('talkCoordinator.ourSpeakerProfile.title') }}
      />
    </Stack>
  );
}
