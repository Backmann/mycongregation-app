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
        name="cleaning"
        options={{
          title: t('congregationHub.cleaning'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="cleaning-week"
        options={{
          headerLeft: () => <BackButton fallback="/publishers/cleaning" toParent />,
        }}
      />
      <Stack.Screen
        name="duties"
        options={{
          title: t('congregationHub.duties'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="duties-meeting"
        options={{
          headerLeft: () => <BackButton fallback="/publishers/duties" toParent />,
        }}
      />
      {/* Moved from the Profile (step 3a, 22 September). The old /profile/…
          addresses forward here. Titles are the ones they had there, except
          «Ответственные», renamed so it no longer shares a word with the
          meeting duties. */}
      <Stack.Screen
        name="responsibilities"
        options={{
          title: t('responsibilities.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="admin-users"
        options={{
          title: t('profile.userManagement'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="journal"
        options={{
          title: t('journal.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="backups"
        options={{
          title: t('backups.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="public-talks"
        options={{
          title: t('profile.publicTalks'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="public-talks-retire"
        options={{
          title: t('publicTalks.retire.pageTitle'),
          headerLeft: () => <BackButton fallback="/publishers/public-talks" toParent />,
        }}
      />
      <Stack.Screen
        name="public-talks-import"
        options={{
          title: t('profile.publicTalksImport'),
          headerLeft: () => <BackButton fallback="/publishers/public-talks" toParent />,
        }}
      />
      <Stack.Screen
        name="songs-import"
        options={{
          title: t('songsImport.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      {/* Meeting times and the halls, one screen since step 3b. */}
      <Stack.Screen
        name="meeting-settings"
        options={{
          title: t('meetingSettings.title'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
        }}
      />
      <Stack.Screen
        name="circuit-overseer"
        options={{
          title: t('profile.circuitOverseer'),
          headerLeft: () => <BackButton fallback="/publishers" toParent />,
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
