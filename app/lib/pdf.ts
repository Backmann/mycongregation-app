import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Open a blank print window synchronously — call this inside a click handler,
 * before any await, so the browser doesn't block it as a popup. Pass the result
 * to exportHtmlAsPdf via `preopenedWindow`. Web only; returns null elsewhere.
 */
export function openPrintWindow(): Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  // Not on iOS, and not when the app was added to the Home Screen.
  //
  // A window opened from there has no address bar and no close button: Safari
  // shows a bare viewer with nothing to press, and the person is stuck looking
  // at their own PDF with no way back into the app. Those cases print from a
  // hidden frame instead — see printViaFrame below.
  if (printsInPlace()) return null;
  return window.open('', '_blank');
}

/**
 * True where opening a second window traps the person.
 *
 * iOS Safari in any form, and any browser running the app from the Home Screen
 * — a standalone window has no chrome of its own to close.
 */
function printsInPlace(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && 'ontouchend' in document);
  const standalone =
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
    (navigator as { standalone?: boolean }).standalone === true;
  return isIOS || standalone;
}

/**
 * Print without leaving the page: a hidden frame holds the document, and the
 * browser's print sheet appears over the app. Cancelling puts the person back
 * exactly where they were, with nothing to close.
 */
function printViaFrame(html: string): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const done = (ok: boolean, reason?: string) => {
      // Removed on a delay: Safari needs the frame alive while its print sheet
      // is up, and tearing it down early cancels the job.
      setTimeout(() => frame.remove(), 60_000);
      resolve({ ok, reason });
    };

    frame.onload = () => {
      try {
        const w = frame.contentWindow;
        if (!w) return done(false, 'no_frame');
        setTimeout(() => {
          w.focus();
          w.print();
          done(true);
        }, 300);
      } catch (e) {
        done(false, String(e));
      }
    };
    frame.srcdoc = html;
  });
}

/**
 * Export an HTML document as a PDF, reusing the same premium HTML we render for
 * every document in the app (visit schedule, S-21, …).
 *
 * - Native (iOS/Android): renders a real PDF file via expo-print, then hands it
 *   to the share sheet (Save to Files / share) via expo-sharing.
 * - Web: uses the browser's print pipeline, where the user picks "Save as PDF".
 *   This keeps text vector-sharp (no rasterisation) and needs no extra deps.
 *
 * The HTML passed in should NOT include an auto-print onload handler — this
 * function drives printing itself.
 *
 * When the export happens after awaiting data, open the window first with
 * openPrintWindow() inside the click and pass it as `preopenedWindow` so the
 * popup isn't blocked.
 */
export async function exportHtmlAsPdf(
  html: string,
  opts?: { fileName?: string; preopenedWindow?: Window | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    if (printsInPlace()) {
      const title = opts?.fileName ?? 'document';
      const withTitle = html.includes('<title>')
        ? html
        : html.replace('<head>', `<head><title>${title}</title>`);
      return printViaFrame(withTitle);
    }
    const win = opts?.preopenedWindow ?? window.open('', '_blank');
    if (!win) return { ok: false, reason: 'popup_blocked' };
    const title = opts?.fileName ?? 'document';
    const withTitle = html.includes('<title>')
      ? html
      : html.replace('<head>', `<head><title>${title}</title>`);
    win.document.open();
    win.document.write(withTitle);
    win.document.close();
    win.focus();
    // Give layout/fonts a moment, then print.
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
    return { ok: true };
  }

  // Native: produce a real PDF file and share it.
  try {
    const { uri } = await Print.printToFileAsync({ html });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: opts?.fileName ?? 'PDF',
        UTI: 'com.adobe.pdf',
      });
      return { ok: true };
    }
    return { ok: true, reason: 'no_sharing' };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
