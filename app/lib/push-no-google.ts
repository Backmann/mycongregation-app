/**
 * A phone with no Google services cannot be sent the app's notifications.
 *
 * Found on 7 October 2026 on a Huawei: Android without Google. The app asks
 * the system for a notification key, the system has nobody to ask, and the
 * answer is MISSING_INSTANCEID_SERVICE. The screen then told the sister that
 * «в сборке нет настроек Firebase, лечится пересборкой» — the cause that hint
 * was written for in July, and untrue here: the build is fine, every other
 * Android receives. Nothing we ship will make that phone receive.
 *
 * So this one failure is recognised and said as what it is, with what DOES
 * reach her: the server writes a letter for whatever reached no device
 * (assignments and their reminders — NotificationsService emailFallback).
 *
 * scripts/check-push-no-google.mjs holds the pattern to the messages it must
 * and must not match.
 */
export const NO_GOOGLE_SERVICES = /MISSING_INSTANCEID_SERVICE|GooglePlayServicesNotAvailable|Google Play services (is|are) (missing|not available|unavailable)/i;

export function noGoogleServices(error: string | null | undefined): boolean {
  return typeof error === 'string' && NO_GOOGLE_SERVICES.test(error);
}
