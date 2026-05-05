import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ServiceGroupsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Service Groups',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/service-groups/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Group' }} />
      <Stack.Screen name="new" options={{ title: 'New Group' }} />
    </Stack>
  );
}
