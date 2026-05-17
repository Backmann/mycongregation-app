import { Platform } from 'react-native';
import { api } from './api';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_KEY;

export type WebPushStatus =
  | 'unsupported'      // browser/platform doesn't support Web Push
  | 'unconfigured'     // EXPO_PUBLIC_VAPID_KEY is missing in this build
  | 'default'          // permission never requested
  | 'denied'           // user denied permission
  | 'granted'          // permission granted, no active subscription
  | 'subscribed';      // permission + active subscription

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isWebSupported(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;
  return true;
}

/**
 * iOS Safari supports Web Push only when the PWA is installed to the home
 * screen. In a regular tab the subscribe API exists but never succeeds.
 * Detect this so the UI can show an "Add to Home Screen" hint.
 */
export function isIosWithoutStandalone(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && 'ontouchend' in document);
  if (!isIOS) return false;

  const standalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  return !standalone;
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (!isWebSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';

  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission === 'default') return 'default';

  // permission === 'granted' — check for an active subscription
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'granted';
  } catch {
    return 'granted';
  }
}

/**
 * Subscribe the current browser to Web Push and register the resulting
 * subscription with the backend. Idempotent: if there's already an active
 * subscription, returns ok without re-creating it.
 */
export async function subscribeToWebPush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isWebSupported()) return { ok: false, reason: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'unconfigured' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'malformed_subscription' };
  }

  await api.post('/web-push-subscriptions', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: window.navigator.userAgent.slice(0, 512),
  });

  return { ok: true };
}

/**
 * Unsubscribe and remove the subscription from both the browser and the
 * backend. Server call is best-effort — the browser-side unsubscribe is
 * what actually stops the pushes.
 */
export async function unsubscribeFromWebPush(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isWebSupported()) return { ok: false, reason: 'unsupported' };

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    try {
      await api.delete('/web-push-subscriptions', { data: { endpoint } });
    } catch (err) {
      console.warn('Web Push: server unsubscribe failed', err);
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
