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
        // A way back even when opened straight by its address (a reload, a
        // link) — there is no history then, and no default arrow (28.09).
        options={{
          title: t('pioneerSchool.scheduleTitle'),
          headerLeft: () => <BackButton fallback="/pioneer-school" toParent />,
        }}
      />
      <Stack.Screen
        name="helpers"
        options={{
          title: t('pioneerSchool.helpers.title'),
          headerLeft: () => <BackButton fallback="/pioneer-school" toParent />,
        }}
      />
    </Stack>
  );
}
