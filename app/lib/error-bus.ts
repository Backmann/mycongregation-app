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

/**
 * Notify from a former Alert.alert(title, body) call. React Native's Alert
 * shows nothing on the web, so these messages used to vanish there entirely.
 * On the strip there is one line, so title and body are joined when both carry
 * weight; a bare title (an error heading with no detail) or a bare body shows
 * alone.
 */
export function notify(title?: string, body?: string, tone: ToastTone = 'error'): void {
  const t = (title ?? '').trim();
  const b = (body ?? '').trim();
  const text = t && b ? `${t}: ${b}` : t || b;
  if (!text) return;
  if (tone === 'success') reportSuccess(text);
  else reportError(text);
}
