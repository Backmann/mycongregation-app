import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { DevicePushState, meApi, NotificationTestResult } from './api';
import { rememberedPushToken } from './push-token-store';
import { useAuth } from './auth';
import { usePushState } from './push-notifications';
import {
  currentWebPushEndpoint,
  getWebPushStatus,
  isIosWithoutStandalone,
  subscribeToWebPush,
  syncWebPush,
} from './web-push';

/**
 * Where THIS device stands with notifications — one answer for the phone app
 * and for the site.
 *
 * The two travel different roads (a device token; a service worker and a
 * browser subscription), and until now each screen asked its own road in its
 * own words: the home screen asked nobody, the settings screen only reported,
 * and the one switch that could turn the site's notifications on sat in the
 * profile where twelve of twenty-three iPhone users never found it.
 */
export type DeviceNotify =
  | 'checking'
  | 'ok'
  /** Could be switched on here and now, and is not. */
  | 'off'
  /** Refused in the phone's or the browser's own settings. */
  | 'denied'
  /** An iPhone showing the site in Safari: iOS hands push only to a site
   *  opened from the Home Screen. */
  | 'not_installed'
  | 'unsupported'
  /** The phone would not issue a token. */
  | 'no_token'
  /** The device is ready and the server would not take it. */
  | 'not_registered';

let webState: DeviceNotify = 'checking';
const listeners = new Set<() => void>();

function setWebState(next: DeviceNotify): void {
  if (webState === next) return;
  webState = next;
  for (const l of listeners) l();
}

/** Ask the browser again, and bring the server into step if it can be. */
export async function refreshDeviceNotify(): Promise<DeviceNotify> {
  if (Platform.OS !== 'web') return 'checking';
  try {
    if (isIosWithoutStandalone()) {
      setWebState('not_installed');
      return webState;
    }
    const status = await getWebPushStatus();
    if (status === 'unsupported' || status === 'unconfigured') {
      setWebState('unsupported');
    } else if (status === 'denied') {
      setWebState('denied');
    } else if (status === 'default') {
      setWebState('off');
    } else {
      // Permission is granted: subscribing needs no tap, and the server is
      // told every time — its half of the subscription goes missing on its own.
      setWebState((await syncWebPush()) ? 'ok' : 'off');
    }
  } catch {
    setWebState('not_registered');
  }
  return webState;
}

/**
 * Switch notifications on from a tap. On the site this asks the browser; in
 * the app the system has already been asked once, and after a refusal only the
 * phone's settings can change the answer — so that is where it leads.
 */
export async function enableDeviceNotify(): Promise<DeviceNotify> {
  if (Platform.OS !== 'web') {
    await Linking.openSettings();
    return 'checking';
  }
  try {
    await subscribeToWebPush();
  } catch {
    // The state below says what came of it.
  }
  return refreshDeviceNotify();
}

/**
 * One test notification to THIS device — the one in the person's hand.
 *
 * Asked without naming the device, the server sends where «one person, one
 * channel» points: pressed on an iPad by somebody whose Android phone is
 * registered, the test arrived on the phone and the iPad looked broken. So
 * the device names itself. One that has nothing registered does not ask at
 * all: there is nowhere for the answer to come.
 */
export async function testThisDevice(): Promise<NotificationTestResult> {
  const device =
    Platform.OS === 'web'
      ? { endpoint: await currentWebPushEndpoint() }
      : { token: rememberedPushToken() };
  if (!device.endpoint && !device.token) {
    return { status: 'no_device', channel: null };
  }
  return meApi.testNotification(device);
}

/** The state of this device; re-renders when it changes. */
export function useDeviceNotify(): DeviceNotify {
  const native = usePushState();
  const web = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => webState,
    () => webState,
  );
  if (Platform.OS === 'web') return web;
  switch (native.kind) {
    case 'registered':
      return 'ok';
    case 'denied':
      return 'denied';
    case 'no_token':
      return 'no_token';
    case 'not_registered':
      return 'not_registered';
    case 'unsupported':
      return 'unsupported';
    default:
      return 'checking';
  }
}

const REPORTABLE: Partial<Record<DeviceNotify, DevicePushState>> = {
  ok: 'ok',
  off: 'off',
  denied: 'denied',
  not_installed: 'not_installed',
  unsupported: 'unsupported',
  no_token: 'no_token',
};

let lastReported: string | null = null;

/**
 * Mounted once, for whoever is signed in: brings the site's subscription into
 * step at every start, and tells the server what this device says about
 * itself, so that «не приходит» has an answer on the administrator's screen.
 */
export function useDeviceNotifySync(): void {
  const { user } = useAuth();
  const state = useDeviceNotify();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || Platform.OS !== 'web') return;
    void refreshDeviceNotify();
    // Back from the browser's settings, or from adding the site to the Home
    // Screen: ask again rather than wait for a reload.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && webState !== 'ok') void refreshDeviceNotify();
    });
    return () => sub.remove();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      lastReported = null;
      return;
    }
    const word = REPORTABLE[state];
    if (!word) return;
    const mark = `${userId}:${word}`;
    if (lastReported === mark) return;
    lastReported = mark;
    meApi.reportPushState(word).catch(() => {
      // Said again at the next start; nothing depends on it now.
      lastReported = null;
    });
  }, [userId, state]);
}
