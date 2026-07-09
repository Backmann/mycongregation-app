import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { usePermissions } from '../../../lib/permissions';

export default function AbsencesLayout() {
  const { t } = useTranslation();
  const { canManageAbsences } = usePermissions();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('absences.title.list'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
          headerRight: () =>
            canManageAbsences ? (
              <Pressable
                onPress={() => router.push('/absences/new' as any)}
                style={{ paddingHorizontal: 12 }}
                hitSlop={8}
              >
                <Ionicons name="add" size={28} color="#0ea5e9" />
              </Pressable>
            ) : null,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          title: t('absences.title.new'),
          headerLeft: () => <BackButton fallback="/absences" toParent />,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t('absences.title.detail'),
          headerLeft: () => <BackButton fallback="/absences" toParent />,
        }}
      />
    </Stack>
  );
}
