import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function PublishersLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('publishers.title.list'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/publishers/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{
          title: t('publishers.title.detail'),
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/publishers" as any);
                }
              }}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }} />
      <Stack.Screen name="new" options={{ title: t('publishers.title.new') }} />
    </Stack>
  );
}
