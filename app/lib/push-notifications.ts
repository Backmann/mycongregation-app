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
/** Whatever the server put in `data`; every field is optional by nature. */
type NotificationData = Record<string, string | undefined>;

interface NotificationRoute {
  path: string;
  params: Record<string, string>;
}

/**
 * Where a notification leads when it is tapped.
 *
 * Only ONE of the thirteen kinds was answered here — a publisher status
 * change — and everything else opened wherever the app happened to be, so a
 * reminder about a task, a duty, cleaning or a visiting speaker took the
 * reader nowhere in particular.
 */
function routeForNotification(
  data: NotificationData,
): NotificationRoute | null {
  // <<< NOTIFICATION ROUTES — one table, two copies. The service worker is
  // loaded by the browser on its own and cannot import from lib/, so this
  // block is duplicated on purpose; scripts/check-notification-routes.mjs
  // compares the two and fails the gate if they ever drift apart.
  switch (data.type) {
    // The history explains WHY the status changed — which months were
    // missed — and that is what the reader of this notification wants. The
    // card shows the person as a whole, most of which is beside the point.
    case 'publisher_status_change':
      return data.publisherId
        ? {
            path: '/service-reports/publisher-history',
            params: { publisherId: data.publisherId },
          }
        : null;
    // taskId travels with these, but there is no screen that opens one task
    // by id. His own list is the closest true answer.
    case 'task_assigned':
    case 'task_soon':
    case 'task_overdue':
      return { path: '/profile/my-tasks', params: {} };
    case 'agenda_approved':
    case 'elders_meeting_tomorrow':
      return {
        path: '/tasks/agenda',
        params: data.meetingId ? { meetingId: data.meetingId } : {},
      };
    case 'report_reminder':
      if (data.scope === 'overseer')
        return { path: '/service-reports/group', params: {} };
      if (data.scope === 'secretary')
        return { path: '/service-reports', params: {} };
      return {
        path: '/service-reports/new',
        params: data.reportMonth ? { reportMonth: data.reportMonth } : {},
      };
    case 'schedule_published':
    case 'schedule_changed':
    // The Memorial has no screen of its own on purpose: its programme opens
    // in the week, in the place of the meeting it took away. So both of its
    // notices lead exactly where the schedule's do.
    case 'memorial_published':
    case 'memorial_tomorrow':
      return {
        path: '/schedule',
        params: data.weekStartDate ? { week: data.weekStartDate } : {},
      };
    case 'field_service_meeting':
      return { path: '/cart/field-service', params: {} };
    // Cleaning has no screen of its own — the assignments live inside the
    // schedule week, so that is where the reminder leads.
    case 'cleaning_after_meeting':
    case 'cleaning_weekly_monday':
    case 'cleaning_weekly_planned':
    case 'cleaning_general_planned':
      return {
        path: '/schedule',
        params: data.weekStart ? { week: data.weekStart } : {},
      };
    default:
      return null;
  }
  // >>> NOTIFICATION ROUTES
}

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
        | NotificationData
        | undefined;

      const route = routeForNotification(data ?? {});
      if (route) {
        router.push({
          pathname: route.path as any,
          params: route.params,
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);
}
