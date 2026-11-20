/**
 * «Файлы программы» (20 November 2026). Lionel: «понятный экран, в котором
 * можно определить, какие файлы добавлены, а значит, какие недели готовы, а
 * какие нет».
 *
 * The EPUB never reaches the server, so «which files» is answered by what
 * they left: the server reports, week by week, whether each meeting has its
 * programme and whether the import wrote it (GET /mwb-import/weeks). This
 * file turns that into what the screen says, and plans the files picked
 * before anything is loaded — which weeks each one adds, which it repeats.
 * Pure: the gate runs it (scripts/check-programme-files.mjs).
 */

export type Meeting = 'midweek' | 'weekend';

export interface FileWeekSide {
  held: boolean;
  /**
   * The file's key part is there with its title (the «Treasures» talk, the
   * study article). A part added by hand, or an empty skeleton, is not.
   */
  programme: boolean;
  parts: number;
  fromFile: boolean;
  byHand: number;
  assigned: number;
  total: number;
}

export interface FileWeek {
  weekStart: string;
  coVisit: boolean;
  midweek: FileWeekSide;
  weekend: FileWeekSide;
}

export interface ProgrammeFiles {
  /** Monday of the congregation's own current week. */
  thisWeek: string;
  weeks: FileWeek[];
  loadedUntil: { midweek: string | null; weekend: string | null };
  nextMissing: { midweek: string | null; weekend: string | null };
}

/**
 * What one meeting of a week shows.
 * - `fromFile`: the import wrote it;
 * - `present`: parts are there, none from a file — loaded before the import
 *   began to remember its titles (24 October 2026) or made by hand. Never
 *   called «вручную»: for old weeks that would be untrue;
 * - `partial`: held, some parts are there but not the programme itself — a
 *   part added by hand is not a loaded week (review, 20 November 2026);
 * - `missing`: the meeting is held and has nothing;
 * - `notHeld`: no meeting that week (convention, Memorial) — even when parts
 *   loaded earlier are still there (`leftover` says so).
 */
export type SideStatus = 'fromFile' | 'present' | 'partial' | 'missing' | 'notHeld';

export function sideStatus(s: FileWeekSide): SideStatus {
  if (!s.held) return 'notHeld';
  if (s.programme) return s.fromFile ? 'fromFile' : 'present';
  return s.parts > 0 ? 'partial' : 'missing';
}

/** Parts left in a week whose meeting is not held. */
export function leftover(s: FileWeekSide): number {
  return s.held ? 0 : s.parts;
}

/** The «Люди» column. */
export type People =
  | { kind: 'past' }
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'some'; assigned: number; total: number };

export function peopleOf(w: FileWeek, thisWeek: string): People {
  if (w.weekStart < thisWeek) return { kind: 'past' };
  const sides = [w.midweek, w.weekend].filter((s) => s.held);
  const total = sides.reduce((n, s) => n + s.total, 0);
  const assigned = sides.reduce((n, s) => n + s.assigned, 0);
  if (total === 0) return { kind: 'none' };
  if (assigned >= total) return { kind: 'all' };
  return { kind: 'some', assigned, total };
}

const WEEKEND_KEY = /^(weekend_|watchtower_|public_talk)/;

/**
 * Which meeting a file is for: by its parts, as the server decides
 * (`isWeekendPartKey`), and by its name only when it has none.
 */
export function fileMeeting(
  name: string,
  partKeys: string[],
): Meeting | null {
  const known = partKeys.filter((k) => k !== 'unknown');
  if (known.length > 0) {
    return known.some((k) => WEEKEND_KEY.test(k)) ? 'weekend' : 'midweek';
  }
  const lower = name.toLowerCase();
  if (lower.startsWith('mwb_') || lower.startsWith('mwb-')) return 'midweek';
  if (lower.startsWith('w_') || lower.startsWith('wp_')) return 'weekend';
  return null;
}

/**
 * What a picked file would do.
 * - `new`: every week it holds is still empty;
 * - `partly`: some weeks are new, some already have their programme;
 * - `repeat`: every week already has it — loading again only fills empty
 *   titles; a title changed by hand and the people stay;
 * - `sameAsOther`: another file in the list brings the same weeks first;
 * - `nothing`: no week to load (none read, or none of its meetings held).
 */
export type FileVerdict = 'new' | 'partly' | 'repeat' | 'sameAsOther' | 'nothing';

export interface FilePlan {
  meeting: Meeting | null;
  weeks: string[];
  newWeeks: string[];
  loadedWeeks: string[];
  notHeldWeeks: string[];
  verdict: FileVerdict;
}

export interface PickedForPlan {
  name: string;
  weekStarts: string[];
  partKeys: string[];
}

/**
 * Plans every picked file against the weeks the server knows. A week the
 * summary does not cover is counted as new: the summary is asked for each
 * file's own weeks, so that only happens when the request failed — and then
 * the import itself still says what it did.
 */
export function planFiles(
  files: PickedForPlan[],
  known: FileWeek[],
): FilePlan[] {
  const byWeek = new Map(known.map((w) => [w.weekStart, w]));
  const taken = new Set<string>();
  return files.map((f) => {
    const meeting = fileMeeting(f.name, f.partKeys);
    const weeks = [...new Set(f.weekStarts)].sort();
    const newWeeks: string[] = [];
    const loadedWeeks: string[] = [];
    const notHeldWeeks: string[] = [];
    for (const w of weeks) {
      const side = meeting ? byWeek.get(w)?.[meeting] : undefined;
      if (side && !side.held) notHeldWeeks.push(w);
      else if (side && side.programme) loadedWeeks.push(w);
      else newWeeks.push(w);
    }
    const mine = meeting ? newWeeks.map((w) => `${meeting}:${w}`) : [];
    const repeatsOther =
      mine.length > 0 && mine.every((k) => taken.has(k));
    mine.forEach((k) => taken.add(k));
    let verdict: FileVerdict;
    if (weeks.length === 0 || weeks.length === notHeldWeeks.length) {
      verdict = 'nothing';
    } else if (repeatsOther) {
      verdict = 'sameAsOther';
    } else if (newWeeks.length === 0) {
      verdict = 'repeat';
    } else if (loadedWeeks.length === 0) {
      verdict = 'new';
    } else {
      verdict = 'partly';
    }
    return { meeting, weeks, newWeeks, loadedWeeks, notHeldWeeks, verdict };
  });
}

/** Files the main button loads: those that add a week nobody else adds. */
export function filesToLoad(plans: FilePlan[]): number[] {
  return plans
    .map((p, i) => (p.verdict === 'new' || p.verdict === 'partly' ? i : -1))
    .filter((i) => i >= 0);
}

/** The window the picked files need from the server, at most 30 weeks each. */
export function windowOf(weekStarts: string[]): { from: string; count: number } | null {
  if (weekStarts.length === 0) return null;
  const sorted = [...weekStarts].sort();
  const from = sorted[0];
  const last = sorted[sorted.length - 1];
  const days =
    (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000;
  return { from, count: Math.min(30, Math.floor(days / 7) + 1) };
}

/**
 * What to load next for one meeting. A week missing BEFORE the last loaded
 * one is a gap, not «from here on nothing» — on the stand (20 November 2026)
 * the card said «готово по 27 декабря» while this very week was empty.
 */
export type NextStep =
  | { kind: 'done' }
  | { kind: 'gap'; week: string }
  | { kind: 'from'; week: string };

export function nextStep(
  loadedUntil: string | null,
  nextMissing: string | null,
): NextStep {
  if (!nextMissing) return { kind: 'done' };
  if (loadedUntil && nextMissing < loadedUntil) {
    return { kind: 'gap', week: nextMissing };
  }
  return { kind: 'from', week: nextMissing };
}
