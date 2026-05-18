import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen
        name="public-talks"
        options={{ title: 'Public talks' }}
      />
      <Stack.Screen
        name="public-talks-import"
        options={{ title: 'Bulk import' }}
      />
      <Stack.Screen
        name="change-password"
        options={{ title: 'Change password' }}
      />
      <Stack.Screen
        name="admin-users"
        options={{ title: 'User management' }}
      />
    </Stack>
  );
}
