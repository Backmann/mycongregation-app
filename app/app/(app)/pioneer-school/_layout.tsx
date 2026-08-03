import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function PioneerSchoolLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackTitle: t('common.back') }}>
      <Stack.Screen name="index" options={{ title: t('pioneerSchool.title') }} />
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
