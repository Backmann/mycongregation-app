import { Stack } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { headerOptions, HEADER_MARK } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import BrandLockup from '../../../components/BrandLockup';
import { HeaderCongregation } from '../../../components/HeaderCongregation';

export default function HomeLayout() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('home.title'),
          headerTitleAlign: 'left',
          headerTitle: () => (
            <BrandLockup
              mark={HEADER_MARK}
              word={compact ? 16 : 18}
              tone="dark"
            />
          ),
          // The congregation's own name sits at the right of the same row.
          headerRight: () => <HeaderCongregation compact={compact} />,
        }}
      />
      <Stack.Screen
        name="my-assignments"
        options={{ title: t('home.myTasksScreen.title') }}
      />
    </Stack>
  );
}
