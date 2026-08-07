import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { headerOptions } from '../../../lib/header';
import { BackButton } from '../../../components/BackButton';

export default function PioneerSchoolLayout() {
  const { t } = useTranslation();
  return (
    // The app has ONE header — brand colour, Manrope, white icons. This
    // section was handed to the navigator without it and got the platform
    // default: a white bar in a teal app.
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('pioneerSchool.title'),
          headerLeft: () => <BackButton fallback="/cart" toParent />,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{ title: t('pioneerSchool.scheduleTitle') }}
      />
      <Stack.Screen
        name="helpers"
        options={{ title: t('pioneerSchool.helpers.title') }}
      />
    </Stack>
  );
}
