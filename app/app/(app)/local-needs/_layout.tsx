import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function LocalNeedsLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
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
