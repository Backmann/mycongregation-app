import { Stack, router } from 'expo-router';
import { headerOptions, HEADER_ICON, HEADER_MARK } from '../../../lib/header';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import BrandLockup from '../../../components/BrandLockup';
import { usePermissions } from '../../../lib/permissions';
import { useAuth } from '../../../lib/auth';

export default function PublishersLayout() {
  const { t } = useTranslation();
  const { canEditPublishers } = usePermissions();
  const { user } = useAuth();
  // The list screen shows the roster to those who may browse it and, to
  // everyone else, only their own group — the server sends nothing more. Its
  // title says which of the two a person is looking at.
  const privileged =
    user?.role === 'admin' || user?.role === 'elder' || user?.canViewPrivateData === true;
  return (
    <Stack screenOptions={headerOptions}>
      {/* The congregation's contents. Groups and absences used to be icons in
          this header; they are rows of the contents now. */}
      <Stack.Screen
        name="index"
        options={{
          title: t('publishers.title.list'),
          headerLeft: () => (
            <View style={{ paddingLeft: 12, paddingRight: 6 }}>
              <BrandLockup mark={HEADER_MARK} markOnly tone="dark" />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="list"
        options={{
          title: privileged ? t('publishers.title.roster') : t('home.actions.myGroup'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
          headerRight: canEditPublishers
            ? () => (
                <Pressable
                  onPress={() => router.push('/publishers/new' as any)}
                  style={{ paddingHorizontal: 10 }}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={28} color={HEADER_ICON} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t('publishers.title.detail'),
          headerLeft: () => <BackButton fallback="/publishers/list" toParent />,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          title: t('publishers.title.new'),
          headerLeft: () => <BackButton fallback="/publishers/list" toParent />,
        }}
      />
    </Stack>
  );
}
