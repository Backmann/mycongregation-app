import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PublishersLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Publishers',
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
      <Stack.Screen name="[id]" options={{ title: 'Publisher' }} />
      <Stack.Screen name="new" options={{ title: 'New Publisher' }} />
    </Stack>
  );
}
