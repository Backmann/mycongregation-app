import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ScheduleLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Schedule',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/schedule/new' as any)}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color="#0ea5e9" />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Assignment' }} />
      <Stack.Screen name="new" options={{ title: 'New Assignment' }} />
    </Stack>
  );
}
