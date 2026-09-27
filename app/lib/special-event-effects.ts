import type { QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { extractErrorMessage } from './api';

/**
 * What else changes when an event does.
 *
 * An event is not only a row in its own list: a circuit visit rewrites the
 * programme of its week, a convention takes the week's meetings away, and the
 * readiness counts, duties, cleaning and the «Собрание» lines all follow from
 * that. The event screens refreshed only the list of events, so the Programme
 * went on showing the old week until something else happened to reload it.
 */
export function invalidateAfterEventChange(qc: QueryClient): void {
  for (const key of [
    'special-events',
    'assignments',
    'readiness',
    'duties',
    'cleaning',
    'me',
    'congregation-summary',
  ]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/** The server's refusals about events, in the reader's words. */
const CODES = [
  'EVENT_PAST_LOCKED',
  'EVENT_MOVED_INTO_PAST',
  'EVENT_PAST_ADMIN_ONLY',
  'EVENT_END_BEFORE_START',
  'CO_VISIT_WEEK_TAKEN',
] as const;

export function eventErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof AxiosError) {
    const code = (error.response?.data as { code?: string } | undefined)?.code;
    if (code && (CODES as readonly string[]).includes(code)) {
      return t(`specialEvents.errors.${code}`);
    }
  }
  return extractErrorMessage(error);
}

/** The last day an event covers, and whether it is behind us. */
export function eventIsOver(
  e: { date: string; endDate: string | null },
  todayISO: string,
): boolean {
  return (e.endDate ?? e.date) < todayISO;
}
