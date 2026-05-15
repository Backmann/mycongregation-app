import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ServiceReportsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Reports',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                onPress={() => router.push('/service-reports/activity' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons
                  name="pulse-outline"
                  size={24}
                  color="#0ea5e9"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/service-reports/group' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons
                  name="people-outline"
                  size={24}
                  color="#0ea5e9"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('/service-reports/new' as any)}
                style={{ paddingHorizontal: 8 }}
                hitSlop={8}
              >
                <Ionicons name="add" size={28} color="#0ea5e9" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: 'Submit Report' }} />
      <Stack.Screen name="group" options={{ title: 'Group reports' }} />
      <Stack.Screen name="audit-log" options={{ title: 'Edit history' }} />
      <Stack.Screen
        name="publisher-history"
        options={{ title: 'Publisher history' }}
      />
      <Stack.Screen
        name="activity"
        options={{ title: 'Activity feed' }}
      />
    </Stack>
  );
}
