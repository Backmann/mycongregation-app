import type { PioneerType } from './api';

/**
 * Whether a publisher is an *active* permanent pioneer right now — they have a
 * pioneer type and their start month has arrived. A future pioneerSince (e.g.
 * "regular pioneer from August" while it's July) means they are not yet a
 * pioneer, so the badge and other pioneer-dependent UI stay accurate.
 */
export function isActivePermanentPioneer(
  pioneerType: PioneerType | null | undefined,
  pioneerSince: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!pioneerType || pioneerType === 'none') return false;
  if (!pioneerSince) return true;
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
  return pioneerSince.slice(0, 7) <= monthKey;
}
