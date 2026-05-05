import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ScheduleLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Schedule',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/schedule/import' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
                accessibilityLabel="Import EPUB"
              >
                <Ionicons name="cloud-upload-outline" size={24} color="#0ea5e9" />
              </Pressable>
              <Pressable
                onPress={() => router.push('/schedule/new' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
                accessibilityLabel="New assignment"
              >
                <Ionicons name="add" size={28} color="#0ea5e9" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Assignment' }} />
      <Stack.Screen name="new" options={{ title: 'New Assignment' }} />
      <Stack.Screen name="import" options={{ title: 'Import MWB' }} />
    </Stack>
  );
}
