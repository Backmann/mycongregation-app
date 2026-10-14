import { Platform } from 'react-native';

/**
 * The app's own typeface for a printed sheet (14 October 2026).
 *
 * A sheet is printed from a fresh window or frame, which knows nothing of
 * the faces the app loaded — so every PDF came out in whatever system font
 * the computer had, and looked different on each. The browser already holds
 * the @font-face rules expo-font put in the page; they are copied into the
 * sheet with their addresses made absolute (a written-out window resolves a
 * relative address against nothing useful).
 *
 * Web only. On a phone the sheet is drawn by the system's print engine and
 * keeps its system font — said, not hidden: nothing here pretends otherwise.
 */
export function appFontFaces(): string {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // a sheet from another origin cannot be read
    }
    for (const rule of Array.from(rules)) {
      if (typeof CSSFontFaceRule === 'undefined' || !(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
      if (!family.startsWith('Manrope_')) continue;
      out.push(
        rule.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, _q, u: string) => {
          try {
            return `url("${new URL(u, window.location.href).href}")`;
          } catch {
            return `url("${u}")`;
          }
        }),
      );
    }
  }
  return out.join('\n');
}

/** Wait for a printed document's faces, but never longer than `ms`. */
export function fontsReady(doc: Document | null | undefined, ms = 2500): Promise<void> {
  const ready = (doc as (Document & { fonts?: { ready: Promise<unknown> } }) | null | undefined)?.fonts?.ready;
  if (!ready) return new Promise((r) => setTimeout(r, 300));
  return Promise.race([
    ready.then(() => undefined),
    new Promise<void>((r) => setTimeout(r, ms)),
  ]);
}
