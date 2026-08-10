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

/** Whether this device can actually ask — hardware present AND enrolled. */
export async function biometricsAvailable(): Promise<boolean> {
  if (!biometricsPossible()) return false;
  const hardware = await LocalAuthentication.hasHardwareAsync();
  if (!hardware) return false;
  return LocalAuthentication.isEnrolledAsync();
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
