import type { TFunction } from 'i18next';
import type { HallBusy } from './api';

/**
 * One line for something else on a day (13 October 2026):
 * «Школа пионерского служения · 09:00–16:00 · Зал Царства Hamm».
 *
 * Shared by the month preview, the meeting window and the month page, so
 * the three say it in the same words. The words are the thing's own — its
 * title, its hours, its place as written — and nothing is concluded from
 * them: whether the hall is really taken is for the planner to judge.
 */
export function hallBusyLine(b: HallBusy): string {
  const hours =
    b.startTime && b.endTime
      ? // Word joiners: «09:00–16:00» never breaks across two lines.
        `${b.startTime}\u2060–\u2060${b.endTime}`
      : (b.startTime ?? b.endTime ?? null);
  return [b.title, hours, b.place].filter(Boolean).join(' · ');
}

/**
 * What the «Вписать в примечание» button puts into the notice: the reason,
 * ended so that the planner only has to add where the group meets instead.
 */
export function hallBusyNoticeSeed(list: HallBusy[], t: TFunction): string {
  const titles = [...new Set(list.map((b) => b.title))].join(', ');
  return t('fieldService.busy.seed', { what: titles });
}

/** The soft ones of a day — what the preparation and the window mention. */
export function softOn(list: HallBusy[] | undefined, date: string): HallBusy[] {
  return (list ?? []).filter((b) => !b.hard && b.date === date);
}
