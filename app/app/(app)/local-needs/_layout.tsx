import { Stack } from 'expo-router';
import { headerOptions } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { screenGate } from '../../../components/ScreenGate';

export default function LocalNeedsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={headerOptions} screenLayout={screenGate('/local-needs')}>
      <Stack.Screen
        name="index"
        options={{
          title: t('localNeeds.title.list'),
          headerLeft: () => <BackButton fallback="/schedule/edit" toParent />,
        }}
      />
    </Stack>
  );
}
