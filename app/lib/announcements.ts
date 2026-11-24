import type { AnnouncementKind, AnnouncementMeeting, AnnouncementWeek } from './api';

/**
 * Announcements read aloud at the meetings (R-01…R-03, 24 November 2026) —
 * the small rules the screens share. Who may do what is the server's; here
 * only what to show.
 */

/** The step of the run sheet where the chairman reads them. */
export const ANNOUNCEMENT_STEPS: Record<AnnouncementKind, string> = {
  midweek: 'midweek_closing_words',
  weekend: 'weekend_announcements',
};

/** Whether a run sheet's step is the one where the list is read. */
export function readsAnnouncements(stepKey: string | null | undefined): AnnouncementKind | null {
  if (stepKey === ANNOUNCEMENT_STEPS.midweek) return 'midweek';
  if (stepKey === ANNOUNCEMENT_STEPS.weekend) return 'weekend';
  return null;
}

/**
 * Where an unread one may be moved on to, one tap: the first meeting still to
 * come (its day today or later), in the weeks loaded. Null when none is loaded.
 */
export function nextMeeting(weeks: AnnouncementWeek[], today: string): AnnouncementMeeting | null {
  for (const w of weeks) {
    for (const m of w.meetings) {
      if (m.date && m.date >= today) return m;
    }
  }
  return null;
}

/** The first line of a letter, for its title in a list. */
export function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
}

/** The rest of it, after the first line. */
export function afterFirstLine(text: string): string {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.trim().length > 0);
  return i < 0 ? '' : lines.slice(i + 1).join('\n').trim();
}

/** «3 из 5» — read ones over all. */
export function readCount(items: { read: boolean }[]): { read: number; all: number } {
  return { read: items.filter((i) => i.read).length, all: items.length };
}

/** Moves an id one place up (−1) or down (+1); the same list when it cannot. */
export function moved(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
