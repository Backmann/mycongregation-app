import { useQuery } from '@tanstack/react-query';
import { meetingSettingsApi, specialEventsApi } from './api';
import { effectiveVersionFor } from './meeting-schedule';
import { useMeetingMoves } from './useMeetingMoves';
import { weekRules } from './week-rules';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day a meeting of a week is actually held — by the week rules, the one
 * authority (a move, a visit, a Saturday congregation). Under the keys the
 * schedule editor already holds, so no second request.
 *
 * Programme audit (20 November 2026): the part window said «23–29 ноября ·
 * Среди недели» instead of the day, and the talk picker judged «given
 * recently» by Sunday whatever day the weekend meeting was.
 */
export function useMeetingDate(
  weekStartDate: string | undefined,
  kind: 'midweek' | 'weekend' | string | undefined,
): string | null {
  const week = (weekStartDate ?? '').trim();
  const valid = ISO_DATE.test(week) && (kind === 'midweek' || kind === 'weekend');
  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    enabled: valid,
  });
  const moves = useMeetingMoves();
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    enabled: valid,
  });
  if (!valid) return null;
  const version = effectiveVersionFor(settingsQuery.data?.versions, week);
  if (!version) return null;
  return weekRules({
    weekStartISO: week,
    version,
    events: eventsQuery.data ?? [],
    moves,
  }).dateOf(kind as 'midweek' | 'weekend');
}
