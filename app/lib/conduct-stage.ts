/**
 * THE CHAIRMAN'S SCREEN AT THE LECTERN (18 October 2026) — the rules it draws
 * by, kept apart from the screen so scripts/check-conduct-stage.mjs can pin
 * them. Pure: no imports.
 *
 * Decided by Lionel on 18 October: the timekeeper taps, the chairman only
 * looks; a laptop (later perhaps a tablet) lies by the lectern, and only the
 * chairman sees it. During the counsel the screen shows no numbers.
 */

/**
 * When the countdown turns amber: one minute before the end on a part of five
 * minutes or more (a talk, the Treasures, the study), thirty seconds on a
 * short one (a student's three or four minutes). On a long part thirty
 * seconds is too late to round a thought off; on a three-minute part a whole
 * amber minute is a third of it and stops meaning anything.
 */
export function warnSecFor(partMin: number): number {
  return partMin >= 5 ? 60 : 30;
}

export type StageTone = 'calm' | 'soon' | 'over';

/** The colour of a countdown with `leftSec` to go on a part of `partMin`. */
export function stageTone(leftSec: number, partMin: number): StageTone {
  if (leftSec < 0) return 'over';
  return leftSec <= warnSecFor(partMin) ? 'soon' : 'calm';
}

/** Before the first tap: how long until the programme's start (negative — late). */
export function untilStartSec(startHHMM: string | null, meetingDayISO: string | null, nowMs: number): number | null {
  const at = momentOf(startHHMM, meetingDayISO);
  return at === null ? null : Math.round((at - nowMs) / 1000);
}

/** A wall-clock moment of the meeting day, «19:00» on «2026-10-21». */
function momentOf(hhmm: string | null, dayISO: string | null): number | null {
  if (!hhmm || !dayISO) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayISO);
  if (!t || !d) return null;
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0).getTime();
}

/**
 * How far behind (positive) or ahead the meeting will end against the
 * programme's own end — so a late START counts too (Lionel, 18 October: «the
 * meeting must begin and end on time»). The old figure summed the parts only
 * and called a meeting begun ten minutes late «по плану».
 *
 * Only on the meeting's own day and within three hours of the programme's
 * end; anywhere else (a test on another day, a wrong setting) the parts-only
 * figure stands.
 */
export const DRIFT_SANE_SEC = 3 * 3600;
export function endDriftSec(
  endsAtMs: number,
  plannedEndHHMM: string | null,
  meetingDayISO: string | null,
  partsOnlySec: number,
): number {
  const planned = momentOf(plannedEndHHMM, meetingDayISO);
  if (planned === null) return partsOnlySec;
  const d = Math.round((endsAtMs - planned) / 1000);
  return Math.abs(d) > DRIFT_SANE_SEC ? partsOnlySec : d;
}

/**
 * Before the first tap, the big countdown («через 2:43») shows only within
 * this long of the start; earlier the screen shows the start time itself.
 */
export const COUNTDOWN_FROM_SEC = 3600;

/**
 * «ПРОВЕРИТЬ ЭКРАН»: the week's own programme run through quickly, on this
 * device only — nothing goes to the server, nothing is saved. Each part shows
 * every state the real screen has: calm, amber, over time, and the counsel
 * after a student part. About two minutes for a whole midweek meeting.
 */
export const DEMO_CALM_MS = 3000;
export const DEMO_WARN_MS = 2500;
export const DEMO_OVER_MS = 1500;
export const DEMO_COUNSEL_MS = 2000;
/** How far over time the demo goes before the next part. */
export const DEMO_OVER_SEC = 12;
/** Where the calm stretch ends, above the amber line. */
const DEMO_CALM_END_ABOVE_WARN_SEC = 8;

export interface DemoSegment {
  partMin: number;
  counselMin: number;
}

export type DemoFrame =
  | { phase: 'part'; index: number; leftSec: number }
  | { phase: 'counsel'; index: number }
  | { phase: 'done' };

function segmentMs(s: DemoSegment): number {
  return DEMO_CALM_MS + DEMO_WARN_MS + DEMO_OVER_MS + (s.counselMin > 0 ? DEMO_COUNSEL_MS : 0);
}

/** What the demo shows `elapsedMs` after it began. */
export function demoFrame(segments: DemoSegment[], elapsedMs: number): DemoFrame {
  let t = Math.max(0, elapsedMs);
  for (let index = 0; index < segments.length; index++) {
    const s = segments[index];
    const total = segmentMs(s);
    if (t >= total) {
      t -= total;
      continue;
    }
    const full = s.partMin * 60;
    const warn = warnSecFor(s.partMin);
    const calmEnd = Math.min(full, warn + DEMO_CALM_END_ABOVE_WARN_SEC);
    if (t < DEMO_CALM_MS) {
      const k = t / DEMO_CALM_MS;
      return { phase: 'part', index, leftSec: Math.round(full - (full - calmEnd) * k) };
    }
    t -= DEMO_CALM_MS;
    if (t < DEMO_WARN_MS) {
      const k = t / DEMO_WARN_MS;
      return { phase: 'part', index, leftSec: Math.round(Math.min(calmEnd, warn) * (1 - k)) };
    }
    t -= DEMO_WARN_MS;
    if (t < DEMO_OVER_MS) {
      const k = t / DEMO_OVER_MS;
      return { phase: 'part', index, leftSec: -Math.max(1, Math.round(DEMO_OVER_SEC * k)) };
    }
    return { phase: 'counsel', index };
  }
  return { phase: 'done' };
}

/** How long the demo of these segments runs, ms. */
export function demoLengthMs(segments: DemoSegment[]): number {
  return segments.reduce((sum, s) => sum + segmentMs(s), 0);
}

/**
 * A REHEARSAL RUNS AS IF THE MEETING WERE NOW (R-73, Lionel 22 November 2026):
 * its «по программе» is its own start plus the programme, not the meeting's
 * hour on its day — on the stand the forecast said «окончание ≈ 18:07 …
 * с опережением» against the real 20:45. The start, rounded to the minute,
 * and its day, in the device's time — what momentOf reads.
 */
export function rehearsalAnchor(meetingStartedAtMs: number | null): { time: string; day: string } | null {
  if (meetingStartedAtMs === null || !Number.isFinite(meetingStartedAtMs)) return null;
  const d = new Date(Math.round(meetingStartedAtMs / 60_000) * 60_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${two(d.getHours())}:${two(d.getMinutes())}`,
    day: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
  };
}

/** How long after the programme's start «Начать встречу» still asks (R-78). */
export const START_QUESTION_SEC = 180;

/**
 * «ВСТРЕЧА НАЧАЛАСЬ В 19:00?» (R-78, Lionel 22 November 2026). On 18.11 and
 * 22.11 both meetings «began» at :01 and the first step was about a minute
 * shorter than the song and the prayer: «Начать» is tapped after the song
 * has begun, and the screen showed a lateness that was not there. Tapped up
 * to three minutes after the start by the programme, on the meeting's day,
 * the screen asks; the moment returned is that start. Later than that — a
 * real late start, shown as such (18 October 2026). Before it, at it, on
 * another day, or with no hour: null, nothing to ask.
 */
export function startQuestionAt(tapMs: number, meetingTime: string | null, meetingDay: string | null): number | null {
  const planned = momentOf(meetingTime, meetingDay);
  if (planned === null) return null;
  const late = tapMs - planned;
  return late > 0 && late <= START_QUESTION_SEC * 1000 ? planned : null;
}

/** Until the congregation has its own (R-76): a prayer, the lead-in of a middle song. */
export const DEFAULT_PRAYER_SEC = 90;
export const DEFAULT_SONG_LEAD_SEC = 20;
/** A song with no known length: the median of the recordings (R-77). */
export const MEDIAN_SONG_SEC = 151;

const WITH_PRAYER = new Set(['midweek_opening_prayer', 'midweek_closing_prayer', 'weekend_opening_prayer', 'weekend_closing_prayer']);
const MIDDLE_SONG = new Set(['mid_song', 'weekend_song']);

/**
 * HOW LONG A SONG STEP WILL TAKE (R-77, 22 November 2026): the song's own
 * recording, plus the prayer after it — or, for the middle song, its lead-in.
 * The programme gives a song with its prayer five or six minutes; on 18.11
 * they took 2:52–4:57. The congregation's own numbers when it has them
 * (R-76), else 1:30 for a prayer (Lionel: «от 1 до 2 минут») and 0:20 for a
 * lead-in. Null for a step that is not a song: the programme's minutes stand.
 */
export function songStepSec(
  key: string,
  songSec: number | null,
  averages: { prayer: number | null; songLead: number | null } | null,
): number | null {
  if (!WITH_PRAYER.has(key) && !MIDDLE_SONG.has(key)) return null;
  const song = songSec ?? MEDIAN_SONG_SEC;
  if (MIDDLE_SONG.has(key)) return song + (averages?.songLead ?? DEFAULT_SONG_LEAD_SEC);
  return song + (averages?.prayer ?? DEFAULT_PRAYER_SEC);
}

/**
 * Whether the programme's song is the one sung at this step. In the week of
 * the circuit overseer's visit he chooses the closing song (run-order), so the
 * programme's number there says nothing of its length: the median is used.
 */
export function songIsProgrammes(key: string, keys: readonly string[]): boolean {
  const closing = key === 'midweek_closing_prayer' || key === 'weekend_closing_prayer';
  return !(closing && keys.some((k) => k === 'co_service_talk' || k === 'co_concluding_talk'));
}

/** A student part's setting as the screens name it: «Проповедь по домам». */
export function settingLabel(t: (key: string) => string, setting: string | null | undefined): string | null {
  if (setting !== 'house' && setting !== 'informal' && setting !== 'public') return null;
  return t(`conduct.setting.${setting}`);
}

/** «Name» · 2:56 — the length beside the quoted name, not inside its quotes. */
export function quotedSong(
  t: (key: string, o: { text: string }) => string,
  name: string,
  len: string | null | undefined,
): string {
  const q = t('common.quoted', { text: name });
  return len ? `${q} · ${len}` : q;
}

/** «2:56». */
export function songLength(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}
