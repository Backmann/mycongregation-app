import { Platform } from 'react-native';
import { enableScreens } from 'react-native-screens';

/**
 * ONE SECTION ON SCREEN AT A TIME, IN THE BROWSER (21 October 2026).
 *
 * On a phone, react-native-screens takes a section that is not open off the
 * screen. In the browser it is switched off, and the bottom tabs then keep
 * every section ever opened laid out on top of each other, the open one at
 * z-index 0 and the rest at -1 — hidden only by being painted over.
 *
 * Chrome paints that correctly. Safari on the iPad did not: Lionel's iPad
 * showed the Home screen showing through «Собрание» and «Профиль», the
 * section titles drawn one over another, and «Служение» not drawn at all
 * (photos of 21 October). Each section's lists scroll in layers of their
 * own, and WebKit put the layers of the sections underneath above the one
 * on top.
 *
 * Switched on here, the library's own web screen does what the phone does:
 * a section that is not open gets `display: none` (react-native-screens
 * Screen.web), so there is nothing underneath to show through. Only the
 * bottom tabs use it in this app — the stacks inside the sections already
 * hide their screens below the top one the same way (native-stack's web
 * view).
 *
 * Imported once, first thing, by app/_layout.tsx: it must run before the
 * tabs are drawn.
 */
if (Platform.OS === 'web') {
  enableScreens(true);
}
