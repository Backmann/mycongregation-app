import { Stack } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { headerOptions, HEADER_MARK } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import BrandLockup from '../../../components/BrandLockup';
import { HeaderCongregation } from '../../../components/HeaderCongregation';
import { GlassHeader } from '../../../components/GlassHeader';
import { homeScroll } from '../../../lib/home-scroll';

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
          // The content passes UNDER this bar, which is what the blur is for:
          // a smear of whatever is scrolling past says «there is more above».
          // The screen pays for it with its own top padding.
          headerTransparent: true,
          header: () => (
            <GlassHeader
              large
              scrollY={homeScroll}
              title={
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <BrandLockup mark={HEADER_MARK} markOnly tone="dark" />
                  <HeaderCongregation size={wordSize} leading />
                </View>
              }
            />
          ),
        }}
      />
      <Stack.Screen
        name="my-assignments"
        options={{ title: t('home.myTasksScreen.title') }}
      />
    </Stack>
  );
}
