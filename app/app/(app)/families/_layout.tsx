import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function FamiliesLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('families.title.list'),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/families/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: t('families.title.detail') }} />
      <Stack.Screen name="new" options={{ title: t('families.title.new') }} />
    </Stack>
  );
}
