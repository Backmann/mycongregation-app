/**
 * A tiny channel for "something went wrong" messages. The query client lives
 * outside React, so it cannot render anything itself — it pushes here and the
 * toast at the root of the app picks it up.
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function reportError(message: string): void {
  for (const l of listeners) l(message);
}

export function onErrorReported(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
