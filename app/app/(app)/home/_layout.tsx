import { Stack } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { headerOptions, HEADER_MARK } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import BrandLockup from '../../../components/BrandLockup';
import { HeaderCongregation } from '../../../components/HeaderCongregation';
import { UpdateChip } from '../../../components/UpdateBanner';

export default function HomeLayout() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const wordSize = compact ? 16 : 18;
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('home.title'),
          headerTitleAlign: 'left',
          // The mark alone, and the congregation's name beside it.
          //
          // The full wordmark used to stand here and the congregation's name at
          // the other end of the same row; on a narrow phone the two met in the
          // middle and overlapped. And the name is what the reader needs: he
          // knows perfectly well which app he opened. Every other section
          // already shows the mark without the wordmark — this was the last
          // place that did not.
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <BrandLockup mark={HEADER_MARK} markOnly tone="dark" />
              <HeaderCongregation size={wordSize} leading />
            </View>
          ),
          // The invitation to update lives here now: in reach of a thumb, and
          // absent entirely while the build is current.
          headerRight: () => <UpdateChip />,
        }}
      />
      <Stack.Screen
        name="my-assignments"
        options={{ title: t('home.myTasksScreen.title') }}
      />
    </Stack>
  );
}
