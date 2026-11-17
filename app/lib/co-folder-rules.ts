import type { CoFolder, FolderAnswer, FolderItem, FolderMarkState } from './co-folder';

/**
 * The pure rules of the folder for the circuit overseer (S-61, 17 November
 * 2026) — what the screen shows and allows. No network here, so
 * scripts/check-co-folder.mjs can hold them to the decisions.
 */

/** The fifteen questions of page 2; these four have only ДА / НЕТ. */
export const QUESTIONS = Array.from({ length: 15 }, (_, i) => i + 1);
export const YES_NO_ONLY = [1, 2, 10, 12];
export function optionsOf(q: number): FolderAnswer[] {
  return YES_NO_ONLY.includes(q) ? ['yes', 'no'] : ['yes', 'no', 'na'];
}

/** Questions the app has data for (decision 5: hints, not answers). */
export const HINTED = [4, 5, 6, 9, 12];

/** The group's own number in 2.1: 2.1.1 … in the order the server gives. */
export function groupNumber(item: FolderItem, key: string): string {
  const i = (item.groups ?? []).findIndex((g) => g.key === key);
  return `2.1.${i + 1}`;
}

/**
 * The lines the screen shows under a filter. «Мои» are the caller's own
 * role(s); «Не готово» every line that is not ready.
 */
export type FolderFilter = 'all' | 'mine' | 'open';
export function filterItems(f: CoFolder, filter: FolderFilter): FolderItem[] {
  if (filter === 'mine') return f.items.filter((i) => f.access.roles.includes(i.role));
  if (filter === 'open') return f.items.filter((i) => !i.ready);
  return f.items;
}

/** How a line stands, for its icon and words. */
export type LineTone = 'done' | 'changed' | 'manual' | 'na' | 'partial' | 'todo';
export function toneOf(i: { state: FolderMarkState | null; changed: boolean; ready: boolean }, partial = false): LineTone {
  if (i.changed) return 'changed';
  if (i.state === 'na') return 'na';
  if (i.state === 'separate' || i.state === 'paper') return 'manual';
  if (i.ready) return 'done';
  if (partial) return 'partial';
  return 'todo';
}

/** «Передано» only after every question of page 2 is answered. */
export function mayHandOver(f: CoFolder): boolean {
  if (!f.page2) return false;
  if (f.page2.erasedAt) return true;
  return f.page2.answered >= f.page2.total;
}

/**
 * The file's name, numbered by the form, so the folder sorts itself:
 * «2.1.3 S-21 Группа 3». Characters a file name cannot hold go.
 */
export function fileName(num: string, title: string): string {
  return `${num} ${title}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}
