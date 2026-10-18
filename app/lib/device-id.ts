/**
 * THIS DEVICE'S OWN NAME for the meeting as it runs (18 October 2026).
 *
 * The timekeeper ran the weekend meeting on his iPad and opened it on his
 * phone too. Both were «his» to the server, both were heard, and the phone
 * sent its own old run over the iPad's. Now the server binds the run to the
 * device that taps (server conduct-live): the account's other devices watch
 * until «Взять ведение».
 *
 * Made once, kept on the device (AsyncStorage — on the web, the browser's
 * storage). Says nothing about the person; it is random. If the storage does
 * not answer, the id lives as long as the app is open — then a reload looks
 * like another device and is offered «Взять ведение», which is the safe way
 * round.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'conduct:device-id';
let cached: string | null = null;
let pending: Promise<string> | null = null;

function fresh(): string {
  const r = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `d${Date.now().toString(36)}${r()}${r()}`.slice(0, 40);
}

const VALID = /^[A-Za-z0-9_-]{8,64}$/;

export function deviceId(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = AsyncStorage.getItem(KEY)
    .then(async (kept) => {
      if (kept && VALID.test(kept)) return kept;
      const made = fresh();
      await AsyncStorage.setItem(KEY, made).catch(() => undefined);
      return made;
    })
    .catch(() => fresh())
    .then((id) => {
      cached = id;
      pending = null;
      return id;
    });
  return pending;
}
