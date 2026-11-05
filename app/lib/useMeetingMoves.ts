import { useQuery } from '@tanstack/react-query';
import { MeetingMove, meetingMovesApi } from './api';

/** The query every screen shares; invalidate it after a move. */
export const MEETING_MOVES_KEY = ['meeting-moves'] as const;

/** One empty list for every caller, so memoised rules do not rerun for nothing. */
const NONE: MeetingMove[] = [];

/**
 * The congregation's one-week meeting moves (4 November 2026) — what the week
 * rules need besides the settings and the events. A server that does not know
 * moves yet answers 404: no moves, nothing breaks.
 */
export function useMeetingMoves(): MeetingMove[] {
  const q = useQuery({
    queryKey: MEETING_MOVES_KEY,
    queryFn: () => meetingMovesApi.list(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return q.data ?? NONE;
}
