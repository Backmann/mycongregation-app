import { Stack } from 'expo-router';
import { headerOptions } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function LocalNeedsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('localNeeds.title.list'),
          headerLeft: () => <BackButton fallback="/schedule" toParent />,
        }}
      />
    </Stack>
  );
}
