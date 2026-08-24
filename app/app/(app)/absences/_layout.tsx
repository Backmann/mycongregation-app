import { Stack, router } from 'expo-router';
import { headerOptions, HEADER_ICON } from '../../../lib/header';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function AbsencesLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: t('absences.title.list'),
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
