import { Stack } from 'expo-router';

export default function FamiliesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Families' }} />
      <Stack.Screen name="[id]" options={{ title: 'Family' }} />
    </Stack>
  );
}
