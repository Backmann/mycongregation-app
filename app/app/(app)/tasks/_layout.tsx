import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
          // The agenda used to float at the foot of the list beside the
          // create button; two buttons in one corner compete for the same
          // thumb. This is a place to GO, which is what a header is for.
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/tasks/agenda' as never)}
              hitSlop={10}
              accessibilityLabel={t('tasks.agenda.open')}
            >
              <Ionicons name="list-outline" size={22} color="#fff" />
            </Pressable>
          ),
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
