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
 * - The OPENING is two steps (Lionel, 22 October 2026): the song and the
 *   prayer — five minutes, on the prayer's row — then the chairman's opening
 *   words, one minute. Until then they were one six-minute step and the
 *   screens could not show which was on.
 * - The CLOSING likewise: the chairman's concluding words, three minutes,
 *   then the song and the prayer, six — on the prayer's row. The words steps
 *   carry the chairman's row but no range on the sheet: his row is no part.
 * - A SONG is `soft`: songs run two to five minutes (Lionel, 22 October
 *   2026), so it counts up and never turns amber or red; its minutes are the
 *   programme's, for the end time only.
 * - The CHAIRMAN and the CBS READER get no segment at all. They are roles
 *   within the meeting rather than items in it: the reader reads inside the
 *   Bible study.
 * - BIBLE READING and EVERY STUDENT PART of the ministry section get their
 *   own duration PLUS ONE MINUTE of counsel. The minute is the chairman's,
 *   not the student's: conduct mode counts the student down from the
 *   programme's own figure (`partMin`) and keeps the minute apart
 *   (`counselMin`) — «время заданий должно быть именно столько, сколько оно
 *   зафиксировано в программе» (Lionel, 14 October 2026).
 * - A DISCUSSION in the ministry section is led by an elder and gets no
 *   counsel after it, so no minute either. The workbook marks it in the
 *   part's first note — «Обсуждение.» — which the import keeps after «: » in
 *   the title. (Read off the workbook's layout; not yet seen in live data.)
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
  /** «<heading>: <first note>» as imported — it tells a discussion apart. */
  partTitle?: string | null;
  /** The programme's own order — which of two weekend songs comes first. */
  partOrder?: number | null;
}

export interface RunSegment {
  /** What this segment is: the part key it belongs to. */
  key: string;
  /** The programme row, where there is one. The song has one; an empty slot does not. */
  assignmentId: string | null;
  /** How many minutes the segment occupies on the clock, counsel included. */
  minutes: number;
  /** The part's own minutes, as the programme prints them. */
  partMin: number;
  /** The counsel minute after a student part; 0 for everything else. */
  counselMin: number;
  /**
   * Whether the schedule sheet stamps a time range on this row. The song runs
   * on the clock but carries no range, or the sheet would fill with rows that
   * name nobody.
   */
  showInterval: boolean;
  /** A song (with its prayer): counted up, never amber or red. */
  soft?: boolean;
  /** The chairman's own words — his row, never a «comes out» step. */
  chairmanWords?: boolean;
}

/** The whole Living-as-Christians block. */
const LIVING_TOTAL_MIN = 15;
/** The opening song and prayer. */
const OPENING_SONG_MIN = 5;
/** The chairman's opening words. */
const OPENING_WORDS_MIN = 1;
/** The middle song. */
const MIDDLE_SONG_MIN = 5;
/** The chairman's concluding words. */
const CLOSING_WORDS_MIN = 3;
/** The closing song and prayer. */
const CLOSING_SONG_MIN = 6;
/** The congregation Bible study — and the service talk that replaces it. */
const STUDY_MIN = 30;
/** Counsel after a student part. */
const COUNSEL_MIN = 1;

/** A ministry-section part led as a discussion — no student, no counsel. */
export function isDiscussion(title: string | null | undefined): boolean {
  if (!title) return false;
  return /(?:^|:\s*)(?:обсуждение|besprechung|discussion)(?=[\s.,:;!]|$)/iu.test(title.trim());
}

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
    counselMin = 0,
    extra: Pick<RunSegment, 'soft' | 'chairmanWords'> = {},
  ) => {
    out.push({
      key,
      assignmentId: it?.id ?? null,
      minutes: minutes + counselMin,
      partMin: minutes,
      counselMin,
      showInterval,
      ...extra,
    });
  };

  push(first('midweek_opening_prayer'), 'midweek_opening_prayer', OPENING_SONG_MIN, true, 0, { soft: true });
  push(first('midweek_chairman'), 'midweek_opening_words', OPENING_WORDS_MIN, false, 0, { chairmanWords: true });
  push(first('treasures_talk'), 'treasures_talk', dur(first('treasures_talk'), 10));
  push(first('spiritual_gems'), 'spiritual_gems', dur(first('spiritual_gems'), 10));
  push(first('bible_reading'), 'bible_reading', dur(first('bible_reading'), 4), true, COUNSEL_MIN);

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
    push(p, key, dur(p, 4), true, isDiscussion(p.partTitle) ? 0 : COUNSEL_MIN);
  }

  push(first('mid_song'), 'mid_song', MIDDLE_SONG_MIN, false, 0, { soft: true });

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

  push(first('midweek_chairman'), 'midweek_closing_words', CLOSING_WORDS_MIN, false, 0, { chairmanWords: true });
  push(first('midweek_closing_prayer'), 'midweek_closing_prayer', CLOSING_SONG_MIN, true, 0, { soft: true });

  return out;
}

/**
 * Song and prayer (4), then the chairman's opening words — he welcomes and
 * introduces the speaker (1). Two steps since 22 October 2026 (Lionel,
 * variant A), like the midweek; together the programme's five minutes.
 */
const WEEKEND_OPENING_MIN = 4;
const WEEKEND_OPENING_WORDS_MIN = 1;
const PUBLIC_TALK_MIN = 30;
/**
 * After the talk (Lionel, 19 October 2026): the chairman thanks the speaker,
 * gives the announcements and calls the study conductor — two minutes; the
 * conductor announces the song — three. One person on the stage per line,
 * so the timekeeper taps when the conductor comes up. Together the five
 * minutes the programme has between the talk and the study.
 */
const WEEKEND_ANNOUNCEMENTS_MIN = 2;
const WEEKEND_SONG_MIN = 3;
const WATCHTOWER_MIN = 60;
/** In the week of the circuit overseer's visit the study is half as long. */
const WATCHTOWER_CO_WEEK_MIN = 30;
const CO_CONCLUDING_TALK_MIN = 30;
/** Concluding words, song and prayer. */
const WEEKEND_CLOSING_MIN = 5;

/**
 * THE WEEKEND MEETING, in the order it is held (18 October 2026) — the same
 * minutes as the schedule sheet (lib/parts.ts buildWeekendPartTimes):
 * song and prayer 4 and the chairman's opening words 1, public talk 30, the chairman's thanks and
 * announcements 2, the song 3, Watchtower study 60, closing 5.
 *
 * In the week of the circuit overseer's visit (Lionel, 18 October 2026):
 * public talk 30, the study 30 without a reader, then his concluding talk
 * 30. The week is told by the concluding talk standing in the programme.
 * A part's own minutes in the programme win, except the study in that week,
 * which is 30 whatever an imported 60 says.
 */
export function buildWeekendRunOrder(items: RunItem[]): RunSegment[] {
  const first = (key: string): RunItem | null => items.find((i) => i.partKey === key) ?? null;
  const dur = (it: RunItem | null, fallback: number): number => it?.partDurationMin ?? fallback;
  const out: RunSegment[] = [];
  const push = (
    it: RunItem | null,
    key: string,
    minutes: number,
    showInterval = true,
    extra: Pick<RunSegment, 'soft' | 'chairmanWords'> = {},
  ) => {
    out.push({ key, assignmentId: it?.id ?? null, minutes, partMin: minutes, counselMin: 0, showInterval, ...extra });
  };
  const coTalk = first('co_concluding_talk');
  push(first('weekend_opening_prayer'), 'weekend_opening_prayer', WEEKEND_OPENING_MIN, true, { soft: true });
  push(first('weekend_chairman'), 'weekend_opening_words', WEEKEND_OPENING_WORDS_MIN, false, { chairmanWords: true });
  push(first('public_talk_speaker'), 'public_talk_speaker', dur(first('public_talk_speaker'), PUBLIC_TALK_MIN));
  // The song before the study. A visit week may carry a second one, the
  // closing song after the overseer's talk (schedule/edit.tsx): the earlier
  // by the programme's order is the one before the study.
  const songs = items
    .filter((i) => i.partKey === 'weekend_song')
    .sort((a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0));
  push(first('weekend_chairman'), 'weekend_announcements', WEEKEND_ANNOUNCEMENTS_MIN, true, { chairmanWords: true });
  push(songs[0] ?? null, 'weekend_song', WEEKEND_SONG_MIN, false, { soft: true });
  push(
    first('watchtower_conductor'),
    'watchtower_conductor',
    coTalk ? WATCHTOWER_CO_WEEK_MIN : dur(first('watchtower_conductor'), WATCHTOWER_MIN),
  );
  if (coTalk) push(coTalk, 'co_concluding_talk', dur(coTalk, CO_CONCLUDING_TALK_MIN));
  push(first('weekend_closing_prayer'), 'weekend_closing_prayer', WEEKEND_CLOSING_MIN, true, { soft: true });
  return out;
}

/** How long the meeting runs on paper. */
export function totalRunMinutes(segments: RunSegment[]): number {
  return segments.reduce((sum, s) => sum + s.minutes, 0);
}
