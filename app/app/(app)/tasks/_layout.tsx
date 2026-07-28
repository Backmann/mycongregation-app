import { Stack } from 'expo-router';
import { headerOptions } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function TasksLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('tasks.title'),
          headerLeft: () => <BackButton fallback="/home" toParent />,
        }}
      />
      <Stack.Screen
        name="agenda"
        options={{
          title: t('tasks.agenda.title'),
          headerLeft: () => <BackButton fallback="/tasks" toParent />,
        }}
      />
    </Stack>
  );
}
