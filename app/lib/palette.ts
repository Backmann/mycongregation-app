/**
 * The colours of the kinds of meeting — one place for the whole app
 * (10 November 2026).
 *
 * Before this, every screen kept its own copy: the weekday meeting was teal
 * in «Программа», blue on Home and a third shade elsewhere, the weekend two
 * violets, field service two greens, an event slate in one place and amber
 * in another. The values are the programme feed's («вариант 5», 9 November
 * 2026), which Lionel approved:
 *
 *  - the weekday meeting — the app's own teal (the header's);
 *  - the weekend meeting — violet;
 *  - field service — green;
 *  - an event of the congregation — a quiet slate;
 *  - the Memorial — a deep maroon, its date tile filled.
 *
 * Colour here says WHICH MEETING. What kind of assignment a person has —
 * a part, a duty, cleaning — keeps its own hues in lib/section-colors.ts.
 */

export type MeetingTone =
  | 'midweek'
  | 'weekend'
  | 'field_service'
  | 'event'
  | 'memorial';

/** The ink: labels, icons, the date in a tile. */
export const MEETING_INK: Record<MeetingTone, string> = {
  midweek: '#0e7490',
  weekend: '#6d28d9',
  field_service: '#15803d',
  event: '#475569',
  memorial: '#7f1d1d',
};

/**
 * The ground of a date tile. The Memorial's tile is filled with its ink
 * and the date is white.
 */
export const MEETING_TILE: Record<MeetingTone, string> = {
  midweek: '#e0f1f5',
  weekend: '#efe9fb',
  field_service: '#e3f3e7',
  event: '#eef1f5',
  memorial: '#7f1d1d',
};

/**
 * The soft ground for an ink of this palette; slate for any other. The
 * Memorial has no soft ground — its tile is filled — so it takes slate here,
 * as the feed always did.
 */
export function tileOf(ink: string): string {
  const tone = (Object.keys(MEETING_INK) as MeetingTone[]).find(
    (k) => k !== 'memorial' && MEETING_INK[k] === ink,
  );
  return tone ? MEETING_TILE[tone] : MEETING_TILE.event;
}
