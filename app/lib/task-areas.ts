import { TaskArea } from './api';

/**
 * The colours an area is shown in — one set, read from two screens.
 *
 * They began on the tasks screen and the agenda needed the same seven. Copying
 * them would have made a fourth list of areas to keep in step, and the three
 * that already exist have caught us out once: «Объявления» was added to the
 * type and to the form and not to the database's own check, and a task with it
 * could not be saved.
 */
export const AREA_BG: Record<TaskArea, string> = {
  ministry: '#E1F5EE',
  teaching: '#EEEDFE',
  care: '#FBEAF0',
  organisation: '#FAEEDA',
  announcements: '#E6F1FB',
  accounts: '#EAF3DE',
  other: '#f1f5f9',
};

export const AREA_FG: Record<TaskArea, string> = {
  ministry: '#0F6E56',
  teaching: '#534AB7',
  care: '#993556',
  organisation: '#854F0B',
  announcements: '#0C447C',
  accounts: '#3B6D11',
  other: '#475569',
};

/** The order they are offered in, everywhere they are offered. */
export const AREAS: TaskArea[] = [
  'ministry',
  'teaching',
  'care',
  'organisation',
  'announcements',
  'accounts',
  'other',
];

/**
 * Which quarter an accounts check covers, said in months.
 *
 * Periods are stored as «2026-Q3» — exact and unreadable — and these quarters
 * do not line up with the calendar's: they run September to November, December
 * to February, and so on. Two checks can stand open at once, and «Проверка
 * счетов» twice over tells nobody which is which.
 */
const QUARTER_KEY: Record<string, string> = {
  Q1: 'sepNov',
  Q2: 'decFeb',
  Q3: 'marMay',
  Q4: 'junAug',
};

export function quarterLabel(
  period: string | null,
  t: (key: string) => string,
): string | null {
  if (!period) return null;
  const q = period.split('-')[1];
  const key = q ? QUARTER_KEY[q] : undefined;
  return key ? t(`tasks.calendar.quarters.${key}`) : null;
}
