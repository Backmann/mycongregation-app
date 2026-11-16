/**
 * Failures of code that is not the app's own (16 November 2026).
 *
 * The journal of failures had one entry from «Выдача и приём»: «TypeError:
 * ts is not iterable at <anonymous>:1:297». Nothing in the app's bundle
 * runs as <anonymous> — on the web every frame of its own code names the
 * bundle file. The same entry was made again on the stand by running a
 * one-line script in the page the way a browser tool or the console does.
 * So it was a check script run by hand on the live site, not the app.
 *
 * Such failures are not sent: they are not the app's, and a journal full of
 * them hides the ones that are. Kept apart so the gate can check it.
 */

/** A frame of a stack: Chrome «at f (url:1:2)», Firefox and Safari «f@url:1:2». */
const FRAME = /^\s*(at\s|.*@)/;

/**
 * True when every place named is outside the app: the console or a tool
 * (<anonymous>, «debugger eval code»), an extension, or another site. A
 * failure that names no place at all is the app's — it is sent.
 */
export function foreignOnly(stack: string | undefined, filename: string | undefined, origin: string): boolean {
  const places: string[] = [];
  if (filename) places.push(filename);
  for (const line of (stack ?? '').split('\n')) if (FRAME.test(line)) places.push(line);
  if (places.length === 0) return false;
  return places.every((p) => !p.includes(origin));
}
