import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { storage } from './storage';

/**
 * The local lock: a fingerprint standing between whoever holds the phone and a
 * session that is already signed in.
 *
 * WHAT THIS IS NOT: a way of signing in. The server never sees a fingerprint —
 * it never leaves the phone's secure hardware, and the system answers the app
 * with nothing more than yes or no. A lost phone is dealt with by ending the
 * session in «Управление пользователями»; this protects the key already in
 * somebody's pocket, which is a different job.
 *
 * The setting lives on the DEVICE and not on the account, because that is what
 * it describes: the same brother may have a tablet with no scanner and a phone
 * with one, and a shared family device belongs to whoever is holding it.
 */

const KEY = 'mycongregation.biometric_lock';

/** Native only: a browser has no scanner to offer, so nothing is offered. */
export function biometricsPossible(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Whether this device can ask AT ALL — by any means it has.
 *
 * The first version demanded an enrolled FINGERPRINT, and that was too strict
 * by half: Lionel's own phone keeps only a PIN, so the setting vanished from a
 * device perfectly able to lock the app. The system's prompt falls back to the
 * PIN or pattern anyway — that fallback was in the code from the start as the
 * escape route for a cut finger. Refusing the whole feature to somebody who
 * has exactly that means was a mistake of my own making.
 *
 * SECRET (a PIN or a pattern) is therefore enough. NONE — a phone that unlocks
 * with a swipe — is not: there would be nothing to ask, and a lock that opens
 * to anybody is worse than no lock, because it looks like protection.
 */
export async function biometricsAvailable(): Promise<boolean> {
  if (!biometricsPossible()) return false;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

/** True when a finger or a face is enrolled, not merely a PIN. */
export async function hasRealBiometrics(): Promise<boolean> {
  if (!biometricsPossible()) return false;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG ||
    level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK;
}

export async function lockEnabled(): Promise<boolean> {
  if (!biometricsPossible()) return false;
  return (await storage.getItem(KEY)) === '1';
}

export async function setLockEnabled(on: boolean): Promise<void> {
  if (on) await storage.setItem(KEY, '1');
  else await storage.removeItem(KEY);
}

/**
 * Ask, and let the system offer its own fallback.
 *
 * `disableDeviceFallback: false` is the important half: a cut finger, a wet
 * hand or a scanner that simply refuses must lead to the phone's own passcode
 * rather than to a locked door. And above even that, the lock screen keeps a
 * «Войти паролем» way out — without it a bandaged thumb means a telephone call
 * to Lionel.
 */
export async function askForFingerprint(prompt: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      disableDeviceFallback: false,
      cancelLabel: undefined,
    });
    return result.success;
  } catch {
    return false;
  }
}

/** Five minutes: long enough to answer a message and come back. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;
