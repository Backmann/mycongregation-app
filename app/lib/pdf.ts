import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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
 */
export async function exportHtmlAsPdf(
  html: string,
  opts?: { fileName?: string },
): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    // Open a new window, write the document, and trigger the print dialog once
    // the content has laid out. "Save as PDF" is available there.
    const win = window.open('', '_blank');
    if (!win) return { ok: false, reason: 'popup_blocked' };
    const title = opts?.fileName ?? 'document';
    // Set document.title so the print dialog suggests it as the file name.
    const withTitle = html.includes('<title>')
      ? html
      : html.replace('<head>', `<head><title>${title}</title>`);
    win.document.open();
    win.document.write(withTitle);
    win.document.close();
    // Give layout/fonts a moment, then print.
    win.onload = () => {
      setTimeout(() => {
        win.focus();
        win.print();
      }, 300);
    };
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
    // No share sheet available — the file still exists at `uri`.
    return { ok: true, reason: 'no_sharing' };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
