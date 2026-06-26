import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import BrandLockup from '../../../components/BrandLockup';

export default function HomeLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('home.title'),
          headerTitleAlign: 'left',
          headerTitle: () => <BrandLockup mark={26} word={18} />,
        }}
      />
      <Stack.Screen
        name="my-assignments"
        options={{ title: t('home.myTasksScreen.title') }}
      />
    </Stack>
  );
}
