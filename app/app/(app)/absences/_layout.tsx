import { Stack, router } from 'expo-router';
import { headerOptions, HEADER_ICON } from '../../../lib/header';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { usePermissions } from '../../../lib/permissions';

export default function AbsencesLayout() {
  const { t } = useTranslation();
  // Without the right to keep others' absences the list shows only one's own
  // — the screen already does that; now its title says so.
  const { canManageAbsences } = usePermissions();
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: canManageAbsences ? t('absences.title.list') : t('absences.title.mine'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
          // Shown to EVERYONE. Anyone may file their own absence — the form
          // locks the publisher to himself for those who may not file for
          // others — so hiding the plus left a regular publisher with the same
          // right and no door in the place every other list keeps one. It had
          // been guarded by canManageAbsences, from the time when only the
          // servant entered these.
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/absences/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color={HEADER_ICON} />
            </Pressable>
          ),
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
