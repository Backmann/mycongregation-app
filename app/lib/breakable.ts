/**
 * A name that may break after its hyphens (24 October 2026).
 *
 * «Paderborn-Russisch-Ost» in a narrow column: Android found no place to
 * break the line inside such a word and cut it wherever the edge fell —
 * «Pa / derborn-Russisch-Ost» (seen on the phone in the talk log). A zero
 * width space after each hyphen gives it those places; nothing changes on
 * screen where the name fits.
 */
export function breakable(name: string): string;
export function breakable(name: string | null | undefined): string | null | undefined;
export function breakable(name: string | null | undefined) {
  return name ? name.replace(/-(?=\S)/g, '-​') : name;
}
