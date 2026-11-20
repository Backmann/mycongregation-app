import type { QueryClient } from '@tanstack/react-query';

/**
 * WHAT A CHANGE TO THE PROGRAMME MAKES STALE (programme audit, 20 November
 * 2026). The screen invalidated only the parts, so the «N из M» badge (the
 * server's count) and the person picker's history (who already has a part
 * this meeting, who was last) stayed as they were until the screen reloaded
 * — and a brother just given part 3 was offered as free for part 4.
 *
 * Every write of «Составление программы» refreshes through here; the gate
 * (check-programme-refresh) keeps it so.
 */
export function refreshProgramme(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['assignments'] }),
    qc.invalidateQueries({ queryKey: ['readiness'] }),
    qc.invalidateQueries({ queryKey: ['publisher-activity'] }),
  ]);
}
