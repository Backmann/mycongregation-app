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

/**
 * Where a message is drawn: the topmost of the open layers (13 October 2026).
 *
 * The strip lived only at the root of the app, and React Native draws a
 * Modal ABOVE the whole app — so a save refused inside a window (a meeting,
 * a rule, an assignment) raised its message UNDER that window, where nobody
 * could see it. Found on the stand: the words were in the page, the window
 * covered them.
 *
 * Each window now carries a strip of its own (<Toast layer />) and enters
 * here while it is open; a message goes to the topmost one only, so it is
 * always in front and never shown twice. The root strip is layer 0 and
 * speaks when no window is open.
 */
const layers: number[] = [];
let nextLayer = 1;

export function enterToastLayer(): number {
  const id = nextLayer++;
  layers.push(id);
  return id;
}

export function leaveToastLayer(id: number): void {
  const i = layers.indexOf(id);
  if (i >= 0) layers.splice(i, 1);
}

/**
 * A window that closes while its strip is still saying something hands the
 * message down to the strip below (13 October 2026).
 *
 * «Встреча отменена» is said by the meeting window and the window closes at
 * once — the message went to the window's own strip and died with it, and
 * the person saw the page change with no word. A message younger than this
 * is passed on; an old one has been read.
 */
export const HANDOVER_MS = 3000;

export interface ShownMessage {
  message: string;
  tone: ToastTone;
  /** Date.now() when it was shown. */
  at: number;
}

/** Leave the layer; a fresh message goes on to whichever strip is now on top. */
export function leaveToastLayerHandingOver(
  id: number,
  shown: ShownMessage | null,
  now: number = Date.now(),
): void {
  leaveToastLayer(id);
  if (!shown || now - shown.at >= HANDOVER_MS) return;
  // After the window has gone: the strip below must already be the top.
  setTimeout(() => {
    if (shown.tone === 'success') reportSuccess(shown.message);
    else reportError(shown.message);
  }, 0);
}

/** Whether a strip is the one that should speak now (0 is the root). */
export function isTopToastLayer(id: number): boolean {
  return layers.length === 0 ? id === 0 : layers[layers.length - 1] === id;
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
