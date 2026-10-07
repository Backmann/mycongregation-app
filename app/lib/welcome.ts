import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The first minute.
 *
 * A newcomer used to be met by a queue of dialogs before seeing a single
 * screen: «выберите язык», then «проверьте контакты», with «включите
 * уведомления» waiting behind. Each is reasonable alone; together they are
 * what a person who «вообще в этом не разбирается» closes without reading.
 *
 * So the server says when a sign-in is the first one ever, and this module
 * remembers it for that account on this device until the person has read the
 * one card that greets them on «Главная» and pressed «Понятно». While it is
 * waiting — and for the rest of that DAY, however many times the app is
 * closed and opened — the yearly contacts question stays out of the way; it
 * comes on a later day, as it does for everybody.
 */
const KEY = (userId: string) => `welcome.pending.${userId}`;
const DAY_KEY = (userId: string) => `welcome.day.${userId}`;

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

let pendingFor: string | null = null;
/** The local day the welcome began on, once known — see ContactsCheckPrompt. */
let greetedDay: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Called by the doors that let somebody in, when the server says «first time». */
export async function beginWelcome(userId: string): Promise<void> {
  pendingFor = userId;
  greetedDay = today();
  emit();
  try {
    await AsyncStorage.setItem(KEY(userId), '1');
    await AsyncStorage.setItem(DAY_KEY(userId), greetedDay);
  } catch {
    // Without storage the card lives for this visit only — still a welcome.
  }
}

/** On start: was a welcome left unread on this device? */
export async function restoreWelcome(userId: string): Promise<void> {
  try {
    greetedDay = await AsyncStorage.getItem(DAY_KEY(userId));
    if ((await AsyncStorage.getItem(KEY(userId))) === '1') pendingFor = userId;
    emit();
  } catch {
    // Nothing to restore.
  }
}

export async function endWelcome(userId: string): Promise<void> {
  if (pendingFor === userId) pendingFor = null;
  emit();
  try {
    await AsyncStorage.removeItem(KEY(userId));
  } catch {
    // It is gone from memory, which is what the screen reads.
  }
}

/** Somebody else signs in on this device: the card was never theirs. */
export function forgetWelcome(): void {
  pendingFor = null;
  greetedDay = null;
  emit();
}

/** Whether today is still the day this person was first greeted here. */
export function welcomedToday(): boolean {
  return greetedDay !== null && greetedDay === today();
}

export function useWelcomePending(userId: string | null | undefined): boolean {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => pendingFor,
    () => null,
  );
  return !!userId && current === userId;
}
