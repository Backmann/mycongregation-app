/**
 * «Не посещать» addresses (12 November 2026) — the parts that are plain
 * rules: when two addresses are the same, which street an address names,
 * which of the territory's streets to offer while typing, and the date a
 * note from the old territory tool already carries.
 *
 * No imports: the gate runs this file on its own (scripts/check-no-calls.mjs).
 * addressKey is the server's rule too (src/territories/territory-no-calls).
 */

/** The same address however it is written: «Straße», «Strasse», «Str.» alike. */
export function addressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/strasse\b|str\.?(?=\s|\d|$)/g, 'str')
    .replace(/[\s.,\-–]+/g, '');
}

/** The street an address names: everything before the house number. */
export function streetOf(address: string): string {
  const m = address.trim().match(/^(.*?)(?:\s+\d.*)?$/);
  return (m ? m[1] : address).trim();
}

/**
 * The territory's streets to offer for what is typed so far: those that
 * begin with it, then those that contain it; none once a number is typed
 * after the street, or when nothing is typed.
 */
export function streetSuggestions(streets: string[], typed: string, max = 6): string[] {
  const t = typed.trim();
  if (!t || /\s\d/.test(t)) return [];
  const k = addressKey(t);
  const starts = streets.filter((s) => addressKey(s).startsWith(k));
  const has = streets.filter((s) => !starts.includes(s) && addressKey(s).includes(k));
  return [...starts, ...has].filter((s) => addressKey(s) !== k).slice(0, max);
}

/**
 * Whether the street of a typed address is among the territory's streets.
 * Unknown (null) when the territory's streets are not known.
 */
export function streetIsInside(streets: string[], address: string): boolean | null {
  if (streets.length === 0) return null;
  const k = addressKey(streetOf(address));
  if (!k) return null;
  return streets.some((s) => addressKey(s) === k);
}

/** The last date written in a note as dd.mm.yyyy (or dd.mm.yy), as ISO. */
export function dateInNote(note: string): string | null {
  const all = [...note.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/g)];
  for (let i = all.length - 1; i >= 0; i--) {
    const [, d, m, y] = all[i];
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) continue;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso) return iso;
  }
  return null;
}

/**
 * The date for one address of a note: the date on the line of the note that
 * names its street, or null. A note often lists several addresses, and only
 * some carry a date.
 */
export function dateForAddress(note: string, address: string): string | null {
  const k = addressKey(streetOf(address));
  if (!k) return null;
  const line = note.split(/\r?\n/).find((l) => addressKey(l).includes(k));
  return line ? dateInNote(line) : null;
}
