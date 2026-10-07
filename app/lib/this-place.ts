import { Platform } from 'react-native';

/**
 * Where this copy of the app is running — in the three words people here
 * actually have to tell apart.
 *
 * The congregation uses the phone app on Android, the website in a browser,
 * and on iPhones the website opened from an icon on the home screen. The last
 * two look alike and are not: the phone keeps a separate memory for the icon,
 * so somebody signed in in Safari is NOT signed in from the icon, and the
 * other way round. «Я же вошёл» and «у меня не открывается» are then both
 * true. Saying which of the three this is — on the welcome card, in «Где вы
 * вошли» — is what lets a person and whoever helps them mean the same thing.
 *
 * Imports nothing of ours: lib/api.ts reads it for every request.
 */
export type PlaceKind = 'app' | 'browser' | 'homescreen';
export type PlacePlatform = 'android' | 'ios' | 'windows' | 'mac' | 'other';

/** The website, opened from its own icon instead of a browser's address bar. */
export function openedFromIcon(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return (
      (window.navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  } catch {
    return false;
  }
}

/** Read out of a browser's own description of itself. */
export function platformOfAgent(
  agent: string,
  touch: boolean,
): PlacePlatform {
  const ua = agent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  // An iPad introduces itself as a Mac; a Mac has no touch screen.
  if (ua.includes('macintosh') || ua.includes('mac os')) {
    return touch ? 'ios' : 'mac';
  }
  if (ua.includes('windows')) return 'windows';
  return 'other';
}

export function thisPlace(): { platform: PlacePlatform; kind: PlaceKind } {
  if (Platform.OS === 'android') return { platform: 'android', kind: 'app' };
  if (Platform.OS === 'ios') return { platform: 'ios', kind: 'app' };
  if (typeof window === 'undefined') return { platform: 'other', kind: 'browser' };
  return {
    platform: platformOfAgent(
      window.navigator.userAgent || '',
      typeof document !== 'undefined' && 'ontouchend' in document,
    ),
    kind: openedFromIcon() ? 'homescreen' : 'browser',
  };
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** «iPhone — значок на экране „Домой“», «Android — приложение». */
export function placeLabel(
  t: T,
  platform: string | null | undefined,
  kind: string | null | undefined,
): string {
  // A session older than the record of what it is used from.
  if (!platform) return t('places.unknown');
  const KNOWN_PLATFORMS = ['android', 'ios', 'windows', 'mac', 'other'];
  const KNOWN_KINDS = ['app', 'browser', 'homescreen'];
  const p = KNOWN_PLATFORMS.includes(platform) ? platform : 'other';
  const k = kind && KNOWN_KINDS.includes(kind) ? kind : 'browser';
  return `${t(`places.platform.${p}`)} — ${t(`places.kind.${k}`)}`;
}
