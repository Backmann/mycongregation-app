/**
 * What a browser's device is, for the server's rule «one notification a
 * physical device» (3 October 2026):
 *
 *   - `ios`     an iPhone or iPad — always gets the message;
 *   - `android` a browser on Android — only when the app on that phone did
 *               not take it, or the person would read everything twice;
 *   - `desktop` a computer — only when nothing in the hand took it.
 *
 * The server cannot work this out alone: iPadOS presents itself as a Mac in
 * its user agent. A Mac has no touch screen and an iPad has, so the device
 * says what it is when it subscribes.
 *
 * Pure on purpose — the gate runs it (scripts/check-web-device-kind.mjs).
 */
export type WebDeviceKind = 'ios' | 'android' | 'desktop';

export function deviceKindOf(
  userAgent: string,
  maxTouchPoints: number,
): WebDeviceKind {
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  return 'desktop';
}
