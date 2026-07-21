import { Stack } from 'expo-router';
import { headerOptions } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function CleaningLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={headerOptions}>
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
