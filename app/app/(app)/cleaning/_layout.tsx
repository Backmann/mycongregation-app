import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function CleaningLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="guide"
        options={{
          title: t('cleaningGuide.title'),
          headerLeft: () => <BackButton fallback="/profile" toParent />,
        }}
      />
    </Stack>
  );
}
