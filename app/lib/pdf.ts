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
  return window.open('', '_blank');
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
