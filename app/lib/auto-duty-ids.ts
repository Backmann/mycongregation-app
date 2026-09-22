import type { Assignment, Duty } from './api';

/**
 * Microphone slot 0 that currently mirrors the Treasures-talk speaker — the
 * «auto» badge. A congregation rule: with assignment automation on, the first
 * microphone of a midweek meeting goes to the brother giving the Treasures talk.
 *
 * Moved here unchanged from the programme screen, so the duties screen shows
 * the same badge by the same rule instead of a second copy of it.
 */
export function autoDutyIdsOf(automationOn: boolean, assignments: Assignment[], duties: Duty[]): Set<string> {
  const ids = new Set<string>();
  if (!automationOn) return ids;
  const treasuresByWeek = new Map<string, string | null>();
  for (const a of assignments) {
    if (a.partKey === "treasures_talk" && a.eventType === "midweek") {
      treasuresByWeek.set(a.weekStartDate, a.publisherId);
    }
  }
  for (const d of duties) {
    if (
      d.dutyType === "microphone" &&
      d.slotIndex === 0 &&
      d.eventType === "midweek" &&
      d.publisherId &&
      treasuresByWeek.get(d.weekStartDate) === d.publisherId
    ) {
      ids.add(d.id);
    }
  }
  return ids;
}
