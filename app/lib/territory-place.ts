/**
 * Places handed between the territory screens (13 November 2026). Pure, no
 * imports, so the gate can check it (scripts/check-territory-place.mjs).
 */

export type Box = [[number, number], [number, number]];

/**
 * A place handed to a map screen as `?at=lon,lat` (13 November 2026): the
 * checks open the new-territory screen and the boundary editor there. Null
 * for anything that is not two numbers in a sane range.
 */
export function placeOf(at: string | string[] | undefined): [number, number] | null {
  const raw = Array.isArray(at) ? at[0] : at;
  if (!raw) return null;
  const parts = raw.split(',').map((p) => p.trim());
  // Number('') is 0: an empty half would be the equator.
  if (parts.length !== 2 || parts.some((p) => p === '')) return null;
  const [lon, lat] = parts.map((p) => Number(p.trim()));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

/** A box widened to hold a place as well. */
export function boxWith(box: Box | null, place: [number, number] | null): Box | null {
  if (!place) return box;
  if (!box) return [place, place];
  return [
    [Math.min(box[0][0], place[0]), Math.min(box[0][1], place[1])],
    [Math.max(box[1][0], place[0]), Math.max(box[1][1], place[1])],
  ];
}

/**
 * A count with its thousands grouped the way each language writes them
 * (13 November 2026; live: «12161 дом»): «12 161» (ru, a no-break space),
 * «12.161» (de), «12,161» (en). Written out, not Intl, so it reads the same
 * on the phone's engine.
 */
export function groupDigits(n: number, lang: string): string {
  const sep = lang.startsWith('de') ? '.' : lang.startsWith('en') ? ',' : ' ';
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.trunc(Math.abs(n)));
  // Four digits stay together in Russian and German («1161»), as printed.
  if (digits.length <= 4 && sep !== ',') return sign + digits;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Whether the holder of a territory hears that its border moved — the
 * server's rule (territory-outline.service, 13 November 2026), said in the
 * editor before saving: a whole per cent of ground or a house changing
 * hands. A few metres bother nobody.
 */
export function holderWillHear(r: {
  held: boolean;
  leaving: number;
  gaining: number;
  houses?: { leaving: number; coming: number } | null;
}): boolean {
  if (!r.held) return false;
  if (r.leaving >= 1 || r.gaining >= 1) return true;
  return !!r.houses && (r.houses.leaving > 0 || r.houses.coming > 0);
}
