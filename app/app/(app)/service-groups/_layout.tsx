import { Stack } from 'expo-router';

export default function ServiceGroupsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Service Groups' }} />
      <Stack.Screen name="[id]" options={{ title: 'Group' }} />
    </Stack>
  );
}
