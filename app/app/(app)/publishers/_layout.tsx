import { Stack } from 'expo-router';

export default function PublishersLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Publishers' }} />
      <Stack.Screen name="[id]" options={{ title: 'Publisher' }} />
    </Stack>
  );
}
