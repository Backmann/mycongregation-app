import type { Hall } from './api';

/**
 * Resolve a stored meeting address to the exact Kingdom Hall street address.
 *
 * Historically generated meetings (and the default generator template) stored
 * hall shorthand like "Зал Царства Hamm". When a configured hall's name equals
 * the stored string — or is contained in it — the hall's full address wins, so
 * cards always show the precise street address. Unknown strings pass through.
 */
export function resolveHallAddress(
  address: string,
  halls: Pick<Hall, 'name' | 'address'>[] | undefined,
): string {
  const a = address.trim();
  if (!a || !halls || halls.length === 0) return address;
  const low = a.toLowerCase();
  for (const h of halls) {
    const name = h.name.trim().toLowerCase();
    const full = h.address.trim();
    if (!full) continue;
    if (low === full.toLowerCase()) return full;
    if (name && (low === name || low.includes(name))) return full;
  }
  return address;
}
