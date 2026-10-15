import AsyncStorage from '@react-native-async-storage/async-storage';
import { conductRunsApi, ConductRunSegment } from './api';
import {
  isExpiredRecord,
  readRunRecord,
  RECORD_PREFIX,
  writeRunRecord,
} from './conduct-run-record';

/**
 * A finished meeting whose result did not reach the server — sent the moment
 * it can be, from ANY screen (15 October 2026).
 *
 * In a hall with no signal the chairman's device keeps the result and shows
 * «Итог не сохранился». Until now it went only when he opened conduct mode
 * again, and until then the elders and ministerial servants saw no result
 * and no reason. Now the app tries at sign-in and every time it comes back to
 * the front; a result already older than seven days is not sent (the server
 * would delete it the same night) and the record goes.
 *
 * A refusal other than «no connection» (he is no longer that week's chairman,
 * say) ends the trying: the result stays on his device, unsent, and the
 * conduct screen still offers «Сохранить ещё раз».
 *
 * Also the place where every run older than seven days leaves the device.
 */
let running = false;

export async function resendPendingConductRuns(now = Date.now()): Promise<void> {
  if (running) return;
  running = true;
  try {
    let keys: readonly string[] = [];
    try {
      keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(RECORD_PREFIX));
    } catch {
      return;
    }
    for (const key of keys) {
      const week = key.slice(RECORD_PREFIX.length);
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(key);
      } catch {
        continue;
      }
      if (isExpiredRecord(raw, week, now)) {
        await AsyncStorage.removeItem(key).catch(() => undefined);
        continue;
      }
      // The keys of the programme are not needed to send what was computed.
      const { state, verdict } = readRunRecord(raw, state0Keys(raw), now);
      if (verdict !== 'current' || state.saved || !state.pending || state.finishedAt === null) continue;
      try {
        await conductRunsApi.save({
          weekStartDate: week,
          segments: state.pending.segments as ConductRunSegment[],
          totalSec: state.pending.totalSec,
          plannedSec: state.pending.plannedSec,
        });
        await AsyncStorage.setItem(key, writeRunRecord({ ...state, saved: true, pending: null }));
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        // No answer at all — try again next time. An answer that says no —
        // stop trying from here; the screen keeps its own «Сохранить ещё раз».
        if (status !== undefined) {
          await AsyncStorage.setItem(key, writeRunRecord({ ...state, pending: null })).catch(
            () => undefined,
          );
        }
      }
    }
  } finally {
    running = false;
  }
}

/** The keys the record itself carries — enough to read it back as it is. */
function state0Keys(raw: string | null): string[] {
  try {
    const o = raw ? (JSON.parse(raw) as { keys?: unknown }) : null;
    return Array.isArray(o?.keys) ? (o.keys as string[]) : [];
  } catch {
    return [];
  }
}
