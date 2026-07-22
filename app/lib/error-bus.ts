/**
 * A tiny channel for transient messages shown as a strip at the bottom of the
 * screen. The query client lives outside React, so it cannot render anything
 * itself — it pushes here and the toast at the root of the app picks it up.
 *
 * Two tones: an error (something was refused or failed) and a confirmation
 * (something quiet succeeded and the screen would otherwise change with no
 * word). They share one channel so only one strip is ever on screen.
 */
export type ToastTone = 'error' | 'success';

type Listener = (message: string, tone: ToastTone) => void;

const listeners = new Set<Listener>();

export function reportError(message: string): void {
  for (const l of listeners) l(message, 'error');
}

export function reportSuccess(message: string): void {
  for (const l of listeners) l(message, 'success');
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @deprecated use onToast — kept so existing imports keep working */
export function onErrorReported(listener: (message: string) => void): () => void {
  return onToast((m, tone) => {
    if (tone === 'error') listener(m);
  });
}
