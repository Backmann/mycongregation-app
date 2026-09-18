/**
 * THE MIDWEEK MEETING'S MINUTES, in one place.
 *
 * This used to live inside `buildMidweekPartTimes`, which returns CLOCK TIMES
 * for the schedule sheet. Conduct mode needs the same figures as DURATIONS:
 * how long the thing the chairman just announced is supposed to run. Two
 * separate walks of the same meeting would have drifted on the first edit, so
 * the walk lives here and `buildMidweekPartTimes` now derives its clock FROM
 * IT.
 *
 * A SEGMENT IS NOT A ROW. That is the whole point of this file:
 *
 * - The MIDDLE SONG takes five minutes but shows no time on the sheet. In
 *   conduct mode it must be a line of its own: it is announced out loud.
 * - The OPENING is one six-minute segment carried on the prayer row — song,
 *   prayer and the chairman's opening words run together and splitting them
 *   would help nobody.
 * - The CLOSING is nine minutes: three of concluding words, six of song and
 *   prayer.
 * - The CHAIRMAN and the CBS READER get no segment at all. They are roles
 *   within the meeting rather than items in it: the reader reads inside the
 *   Bible study.
 * - BIBLE READING and EVERY MINISTRY PART get their own duration PLUS ONE
 *   MINUTE of counsel.
 * - LIVING AS CHRISTIANS shares a fifteen-minute block among the parts that
 *   carry no duration of their own.
 *
 * THE CIRCUIT OVERSEER'S VISIT. That week the congregation Bible study is
 * withdrawn and the service talk stands in its place for the same thirty
 * minutes. The old walk did not know about it: the clock still came out right
 * (the withdrawn slot advanced it by thirty anyway), but THE TALK ITSELF got
 * no time — no range on the sheet, and no countdown in conduct mode. Here it
 * takes the study's place.
 */

/** A part of the week as the server hands it over. */
export interface RunItem {
  id: string;
  partKey: string;
  partDurationMin: number | null;
}

export interface RunSegment {
  /** What this segment is: the part key it belongs to. */
  key: string;
  /** The programme row, where there is one. The song has one; an empty slot does not. */
  assignmentId: string | null;
  /** How many minutes the segment occupies. */
  minutes: number;
  /**
   * Whether the schedule sheet stamps a time range on this row. The song runs
   * on the clock but carries no range, or the sheet would fill with rows that
   * name nobody.
   */
  showInterval: boolean;
}

/** The whole Living-as-Christians block. */
const LIVING_TOTAL_MIN = 15;
/** Song, prayer and the chairman's opening words. */
const OPENING_MIN = 6;
/** The middle song. */
const MIDDLE_SONG_MIN = 5;
/** Concluding words (3) plus song and prayer (6). */
const CLOSING_MIN = 9;
/** The congregation Bible study — and the service talk that replaces it. */
const STUDY_MIN = 30;

export function buildMidweekRunOrder(items: RunItem[]): RunSegment[] {
  const first = (key: string): RunItem | null =>
    items.find((i) => i.partKey === key) ?? null;
  const dur = (it: RunItem | null, fallback: number): number =>
    it?.partDurationMin ?? fallback;

  const out: RunSegment[] = [];
  /**
   * A segment is pushed EVEN WHEN THE ROW IS MISSING. That is what the old
   * `span` did: an absent part still advanced the clock, so a gap in the
   * programme did not pull the rest of the meeting forward. Behaviour kept
   * to the letter.
   */
  const push = (
    it: RunItem | null,
    key: string,
    minutes: number,
    showInterval = true,
  ) => {
    out.push({ key, assignmentId: it?.id ?? null, minutes, showInterval });
  };

  push(first('midweek_opening_prayer'), 'midweek_opening_prayer', OPENING_MIN);
  push(first('treasures_talk'), 'treasures_talk', dur(first('treasures_talk'), 10));
  push(first('spiritual_gems'), 'spiritual_gems', dur(first('spiritual_gems'), 10));
  push(first('bible_reading'), 'bible_reading', dur(first('bible_reading'), 4) + 1);

  for (const key of [
    'apply_yourself_1',
    'apply_yourself_2',
    'apply_yourself_3',
    'apply_yourself_4',
  ]) {
    const p = first(key);
    // Unlike the rest, a missing ministry part is skipped ENTIRELY: there are
    // three to five of them and they leave no empty slot behind.
    if (!p) continue;
    push(p, key, dur(p, 4) + 1);
  }

  push(first('mid_song'), 'mid_song', MIDDLE_SONG_MIN, false);

  const living = ['living_christians_1', 'living_christians_2', 'living_christians_3']
    .map(first)
    .filter((x): x is RunItem => !!x);
  const known = living.reduce((sum, p) => sum + (p.partDurationMin ?? 0), 0);
  const unknownCount = living.filter((p) => p.partDurationMin == null).length;
  const shareMin =
    unknownCount > 0
      ? Math.max(1, Math.round((LIVING_TOTAL_MIN - known) / unknownCount))
      : 0;
  for (const p of living) push(p, p.partKey, p.partDurationMin ?? shareMin);

  // The Bible study — or the service talk standing in its place.
  const study = first('cbs_conductor');
  const coTalk = first('co_service_talk');
  if (!study && coTalk) push(coTalk, 'co_service_talk', dur(coTalk, STUDY_MIN));
  else push(study, 'cbs_conductor', dur(study, STUDY_MIN));

  push(first('midweek_closing_prayer'), 'midweek_closing_prayer', CLOSING_MIN);

  return out;
}

/** How long the meeting runs on paper. */
export function totalRunMinutes(segments: RunSegment[]): number {
  return segments.reduce((sum, s) => sum + s.minutes, 0);
}
