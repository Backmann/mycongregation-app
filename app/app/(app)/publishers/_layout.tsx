import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/families' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
                accessibilityLabel={t('families.title.list')}
              >
                <Ionicons name="home-outline" size={24} color="#0ea5e9" />
              </Pressable>
              <Pressable
                onPress={() => router.push('/publishers/new' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
              >
                <Ionicons name="add" size={28} color="#0ea5e9" />
              </Pressable>
            </View>
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
