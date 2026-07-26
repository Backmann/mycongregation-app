import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { pushApi } from './api';
import { useAuth } from './auth';

/**
 * Where this device stands with notifications.
 *
 * Both ways this can fail — the device refusing a token, and the server
 * refusing the registration — used to end in a console warning, which in a
 * real build nobody ever sees. «Уведомления не приходят» then gives not one
 * clue as to why. The state is kept here so the settings screen can simply
 * say what happened.
 */
export type PushState =
  | { kind: 'idle' }
  | { kind: 'unsupported' } // web: expo-notifications is native-only
  | { kind: 'denied' } // the person said no, or the system did
  | { kind: 'no_token'; error: string } // the device would not issue one
  | { kind: 'not_registered'; error: string } // the server would not take it
  | { kind: 'registered'; token: string };

let pushState: PushState = { kind: 'idle' };
const listeners = new Set<() => void>();

function setPushState(next: PushState): void {
  pushState = next;
  for (const l of listeners) l();
}

/** Read the current state in a component; re-renders when it changes. */
export function usePushState(): PushState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => pushState,
    () => pushState,
  );
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? 'unknown');
}

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
  if (Platform.OS === 'web') {
    setPushState({ kind: 'unsupported' });
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    finalStatus = requested;
  }

  if (finalStatus !== 'granted') {
    setPushState({ kind: 'denied' });
    return null;
  }

  try {
    // The project is named explicitly. It can usually be read out of the
    // manifest, but "usually" is how a build ends up silently without
    // notifications, and the documented form costs nothing.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig
        ?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResponse.data;
  } catch (err) {
    // On Android this is where a build without Firebase configuration lands:
    // the device cannot issue a token at all, so nothing is ever registered
    // and nothing ever arrives.
    setPushState({ kind: 'no_token', error: describe(err) });
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
        setPushState({ kind: 'registered', token });
      } catch (err) {
        setPushState({ kind: 'not_registered', error: describe(err) });
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
