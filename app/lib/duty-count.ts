import type { Duty, DutyType } from './api';

/**
 * Places a congregation may leave empty, so they are not counted — mirrored
 * from the server's OPTIONAL_DUTIES (src/common/enums/duty-type.enum.ts),
 * which «Собрание» and the readiness counts use.
 *
 * The list of meetings counted without the timekeeper («0 из 8») while the
 * meeting's own sheet counted him («0/9») — the same meeting, two numbers
 * (walk, 27 October 2026). One rule, here, for every count on the app's side.
 */
export const OPTIONAL_DUTY_TYPES: ReadonlySet<DutyType> = new Set<DutyType>(['timekeeper']);

/** How many of these places are filled, out of how many count. */
export function countDuties(list: Pick<Duty, 'dutyType' | 'publisherId'>[]): { assigned: number; total: number } {
  let assigned = 0;
  let total = 0;
  for (const d of list) {
    if (OPTIONAL_DUTY_TYPES.has(d.dutyType)) continue;
    total += 1;
    if (d.publisherId) assigned += 1;
  }
  return { assigned, total };
}
