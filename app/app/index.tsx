import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { NoConnectionScreen } from '../components/ConnectionState';

export default function Index() {
  const { user, isLoading, unreachable } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // See components/ConnectionState.tsx: «нет связи» is not «вас выбросило».
  if (!user && unreachable) return <NoConnectionScreen />;

  return <Redirect href={(user ? '/(app)/home' : '/(auth)/login') as any} />;
}
