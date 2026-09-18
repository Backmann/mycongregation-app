import i18n from './i18n';
import { getPartLabel } from './parts';

/**
 * HOW A PART OF THE PROGRAMME IS NAMED ON SCREEN.
 *
 * This lived inside the schedule screen, which was fine while the schedule was
 * the only thing that named parts. Conduct mode names them too — and the
 * chairman reads that name out loud, so it cannot differ from the one on the
 * sheet by so much as a word. Importing it from the screen file would have
 * dragged the whole schedule module (and its queries) into conduct mode and
 * risked a require cycle, so it lives here instead and both sides ask for it.
 *
 * NOT THE ONLY NAMING IN THE APP, and that is worth knowing. The print builder
 * inside the schedule screen has its own `realPartName`, and the two disagree
 * on two kinds of part: for the public talk and for songs, the sheet shows the
 * whole imported title while the printout cuts it at the colon.That predates
 * this file and is left alone here; naming them together is its own change.
 */

/** Prayers carry the song in their title; the song is shown as the subtitle. */
const PRAYER_PARTS = new Set<string>([
  'midweek_opening_prayer',
  'midweek_closing_prayer',
  'weekend_opening_prayer',
  'weekend_closing_prayer',
]);

/** Extracts just the song reference (e.g. "Песня 44") from a prayer title. */
export function songFromTitle(title: string): string | null {
  const m = title.match(/(?:Песня|Song|Lied)\s*№?\s*\d+/i);
  return m ? m[0] : null;
}

export interface PartDisplay {
  label: string;
  subtitle: string | null;
  overline?: string;
}

/**
 * Bold label + subtitle for an assignment. For parts whose imported title is
 * "<MWB part name>: <description>", show the real MWB name as the bold label
 * and the rest as the subtitle; otherwise use the generic part label + full
 * title.
 */
export function partDisplay(
  partKey: string,
  partTitle: string | null | undefined,
): PartDisplay {
  // Weekend: show the part role as an overline above the EPUB topic, so it
  // is clear what the topic belongs to. The reader's long label is shortened.
  if (partKey === 'public_talk_speaker') {
    return {
      label: partTitle || getPartLabel('public_talk_speaker'),
      subtitle: null,
    };
  }
  if (partKey === 'watchtower_conductor') {
    return {
      label: partTitle || getPartLabel('watchtower_conductor'),
      subtitle: null,
    };
  }
  if (partKey === 'watchtower_reader') {
    return { label: i18n.t('schedule.weekend.reader'), subtitle: null };
  }
  if (
    partKey === 'mid_song' ||
    partKey === 'weekend_song' ||
    partKey === 'weekend_opening_song'
  ) {
    return { label: partTitle || i18n.t('parts.song'), subtitle: null };
  }
  if (PRAYER_PARTS.has(partKey)) {
    return {
      label: getPartLabel(partKey),
      subtitle: partTitle ? songFromTitle(partTitle) : null,
    };
  }
  // EPUB/override title is always the heading when present; the generic
  // part label is only a fallback for untitled parts.
  if (partTitle) {
    const idx = partTitle.indexOf(': ');
    if (idx > 0) {
      // treasures_talk: topic only — hide the enriched detail note for
      // the opening "Treasures" talk; other parts keep their subtitle.
      const isTreasuresTalk = partKey === 'treasures_talk';
      return {
        label: partTitle.slice(0, idx),
        subtitle: isTreasuresTalk ? null : partTitle.slice(idx + 2).trim() || null,
      };
    }
    return { label: partTitle, subtitle: null };
  }
  return { label: getPartLabel(partKey), subtitle: null };
}
