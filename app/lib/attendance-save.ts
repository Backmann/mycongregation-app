import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError } from 'axios';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import i18n from './i18n';
import {
  attendanceApi,
  extractErrorMessage,
  type AttendanceInput,
} from './api';
import { confirm } from '../components/ConfirmHost';
import { reportError, reportSuccess } from './error-bus';

/**
 * SAVING AN ATTENDANCE FIGURE — one path for the card on Home and the sheet
 * (31 October 2026).
 *
 * Before anything is sent, the slips worth a second look are asked about:
 * a held meeting with nobody there is almost always a figure not yet typed,
 * and a figure more than twice this meeting's usual one is almost always an
 * extra digit. The yardstick is the congregation's own attendance, never the
 * publisher count: children, guests and the interested make the figure
 * larger, and that is no mistake (the rule of 23 July).
 *
 * A form already sent to the branch is asked about too — it went out with
 * the old figure.
 *
 * Three may enter the figure; when two do at once the server answers 409 with
 * who was first, and the second is asked whether to replace it.
 *
 * Without a connection the figure is not lost: it waits on the phone and
 * goes when the server answers again — at the hall the signal is often weak.
 */

export type SaveOutcome = 'saved' | 'queued' | 'cancelled' | 'failed';

export interface SaveContext {
  /** The usual figure for this meeting — the year's or last year's average. */
  typical?: number | null;
  /** «S-10 за этот год уже отправлен…» — said before saving, when it was. */
  sentWarning?: string | null;
}

const t = (key: string, opts?: Record<string, unknown>) =>
  i18n.t(key, opts) as string;

function when(iso: string | null | undefined): string {
  return iso ? dayjs(iso).locale(i18n.language).format('D MMMM, HH:mm') : '';
}

/** Ask about the likely slips; true — go on. */
export async function passesSecondLook(
  input: AttendanceInput,
  ctx: SaveContext,
): Promise<boolean> {
  if (!input.notHeld && input.count === 0) {
    const ok = await confirm({
      title: t('attendance.check.zeroTitle'),
      body: t('attendance.check.zeroBody'),
      confirmLabel: t('attendance.check.zeroYes'),
    });
    if (!ok) return false;
  }
  if (
    !input.notHeld &&
    typeof input.count === 'number' &&
    ctx.typical &&
    ctx.typical > 0 &&
    input.count > ctx.typical * 2
  ) {
    const ok = await confirm({
      title: t('attendance.check.bigTitle', { count: input.count }),
      body: t('attendance.check.bigBody', {
        count: input.count,
        typical: ctx.typical,
      }),
      confirmLabel: t('attendance.check.bigYes', { count: input.count }),
    });
    if (!ok) return false;
  }
  if (ctx.sentWarning) {
    const ok = await confirm({
      title: t('attendance.check.sentTitle'),
      body: ctx.sentWarning,
      confirmLabel: t('attendance.check.sentYes'),
    });
    if (!ok) return false;
  }
  return true;
}

function nothingAnswered(e: unknown): boolean {
  if (!(e instanceof AxiosError)) return false;
  return !e.response;
}

function alreadyRecorded(e: unknown): {
  count: number | null;
  onlineCount: number | null;
  notHeld: boolean;
  recordedByName: string | null;
  recordedAt: string | null;
} | null {
  if (!(e instanceof AxiosError) || e.response?.status !== 409) return null;
  const body = e.response.data as { code?: string; current?: unknown };
  if (body?.code !== 'ATTENDANCE_ALREADY_RECORDED') return null;
  return (body.current as never) ?? null;
}

/**
 * Save one figure with every check above. Says the outcome in a toast; the
 * caller refreshes its data on 'saved' and 'queued'.
 */
export async function saveAttendance(
  userId: string | null,
  input: AttendanceInput,
  ctx: SaveContext = {},
): Promise<SaveOutcome> {
  if (!(await passesSecondLook(input, ctx))) return 'cancelled';
  try {
    await attendanceApi.record(input);
    reportSuccess(t('attendance.saved'));
    return 'saved';
  } catch (e) {
    const first = alreadyRecorded(e);
    if (first) {
      const replace = await confirm({
        title: t('attendance.conflict.title'),
        body: first.notHeld
          ? t('attendance.conflict.bodyNotHeld', {
              name: first.recordedByName ?? t('attendance.conflict.someone'),
              when: when(first.recordedAt),
            })
          : t('attendance.conflict.body', {
              name: first.recordedByName ?? t('attendance.conflict.someone'),
              count: first.count,
              when: when(first.recordedAt),
            }),
        confirmLabel: input.notHeld
          ? t('attendance.conflict.replaceNotHeld')
          : t('attendance.conflict.replace', { count: input.count }),
      });
      if (!replace) return 'cancelled';
      const { expectNew: _n, expectedRecordedAt: _r, ...plain } = input;
      try {
        await attendanceApi.record(plain);
        reportSuccess(t('attendance.saved'));
        return 'saved';
      } catch (e2) {
        reportError(extractErrorMessage(e2));
        return 'failed';
      }
    }
    if (nothingAnswered(e) && userId) {
      await queue(userId, input);
      reportSuccess(t('attendance.queued'));
      return 'queued';
    }
    reportError(extractErrorMessage(e));
    return 'failed';
  }
}

// ---- the figures waiting for a connection ----------------------------------

const KEY = 'mycongregation.attendance-queue';

interface Stored {
  userId: string;
  items: AttendanceInput[];
}

async function read(userId: string): Promise<AttendanceInput[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    // Somebody else's figures on this device are not his to send.
    return parsed && parsed.userId === userId && Array.isArray(parsed.items)
      ? parsed.items
      : [];
  } catch {
    return [];
  }
}

async function write(userId: string, items: AttendanceInput[]): Promise<void> {
  try {
    if (items.length === 0) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify({ userId, items }));
  } catch {
    // A full store: nothing more can be done here.
  }
}

async function queue(userId: string, input: AttendanceInput): Promise<void> {
  const items = await read(userId);
  // One waiting figure per meeting: the latest stands.
  const rest = items.filter(
    (i) => !(i.date === input.date && i.eventType === input.eventType),
  );
  await write(userId, [...rest, input]);
}

/** The figures still waiting on this phone. */
export async function waitingFigures(
  userId: string | null,
): Promise<AttendanceInput[]> {
  return userId ? read(userId) : [];
}

let sending = false;

/**
 * Send what waits. A figure the server refuses on its merits — somebody was
 * first, the day is not a meeting — is dropped and said; one nothing answered
 * for waits for the next try. True when something went.
 */
export async function sendWaiting(userId: string | null): Promise<boolean> {
  if (!userId || sending) return false;
  sending = true;
  let sent = false;
  try {
    const items = await read(userId);
    const left: AttendanceInput[] = [];
    for (const item of items) {
      try {
        await attendanceApi.record(item);
        sent = true;
      } catch (e) {
        if (nothingAnswered(e)) {
          left.push(item);
          continue;
        }
        const first = alreadyRecorded(e);
        reportError(
          first
            ? t('attendance.conflict.dropped', {
                date: dayjs(item.date).locale(i18n.language).format('D MMMM'),
                name: first.recordedByName ?? t('attendance.conflict.someone'),
                count: first.count ?? '—',
              })
            : extractErrorMessage(e),
        );
        sent = true;
      }
    }
    await write(userId, left);
    if (sent && left.length === 0) reportSuccess(t('attendance.queueSent'));
  } finally {
    sending = false;
  }
  return sent;
}
