import { router, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HEADER_ICON, headerOptions } from '../../../lib/header';
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
            // The padding is what keeps it off the edge — every other header
            // in the app wraps its icon this way, and this one did not, so it
            // sat flush against the screen and looked clipped.
            <Pressable
              onPress={() => router.push('/tasks/agenda' as never)}
              style={{ paddingHorizontal: 10 }}
              hitSlop={8}
              accessibilityLabel={t('tasks.agenda.open')}
            >
              <Ionicons name="list-outline" size={22} color={HEADER_ICON} />
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
