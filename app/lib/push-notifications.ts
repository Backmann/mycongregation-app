import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { pushApi } from './api';
import { useAuth } from './auth';

// Show notifications in foreground (banner + sound, no badge)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    finalStatus = requested;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Permission not granted');
    return null;
  }

  try {
    // In Expo Go and dev builds this works without projectId.
    // For EAS production builds, set expo.extra.eas.projectId in app.json.
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    return tokenResponse.data;
  } catch (err) {
    console.warn('[Push] getExpoPushTokenAsync failed:', err);
    return null;
  }
}

/**
 * Hook for push notification setup on authenticated screens.
 *
 *   1. Requests permission (idempotent)
 *   2. Gets Expo push token
 *   3. POSTs token to /push-tokens with device info
 *   4. Listens for taps → navigates to publisher-history
 *
 * No-op on web (expo-notifications is native-only).
 * Hook order is unconditional; the *effects* are gated.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const router = useRouter();
  const registeredRef = useRef<string | null>(null);

  // Register token whenever a user is present
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;

    let cancelled = false;

    (async () => {
      const token = await getPushToken();
      if (cancelled || !token) return;
      if (registeredRef.current === token) return; // same token already registered

      try {
        await pushApi.register(token, {
          platform: Platform.OS,
          osVersion: Platform.Version != null ? String(Platform.Version) : null,
        });
        registeredRef.current = token;
        console.log('[Push] Token registered with backend');
      } catch (err) {
        console.warn('[Push] Backend registration failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Tap handler — works whether app is foreground, background, or killed
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; publisherId?: string }
        | undefined;

      if (data?.type === 'publisher_status_change' && data?.publisherId) {
        router.push({
          pathname: '/service-reports/publisher-history' as any,
          params: { publisherId: String(data.publisherId) },
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);
}
