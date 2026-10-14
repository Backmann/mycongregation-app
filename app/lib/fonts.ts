import { Platform, Text, TextInput } from 'react-native';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

/**
 * Manrope is the app-wide typeface — a clean, premium grotesque with full
 * Cyrillic + Latin-ext coverage (RU / DE / EN).
 *
 * Application strategy (RN 0.81-safe, weight-correct on web AND native):
 *  - We load all five faces.
 *  - Regular is set as the base family via defaultProps, so any text without an
 *    explicit weight inherits Manrope. We do NOT wrap Text.render (that blanked
 *    the schedule on RN 0.81).
 *  - A weight is said by the FACE alone ('Manrope_600SemiBold',
 *    'Manrope_700Bold', …), never by `fontWeight` beside it (14 October
 *    2026). Android looks a custom family plus a weight up as «Manrope_700Bold,
 *    bold», finds nothing registered under that pair, and draws Roboto — which
 *    is what most of the app looked like on a phone until then.
 *  - defaultProps only apply to a Text WITHOUT a style: any style replaces
 *    them. So every Text that has a style names its face in that style;
 *    scripts/check-fonts.mjs holds both rules in the gate.
 */
let applied = false;

function applyBaseFont() {
  if (applied) return;
  applied = true;
  const apply = (C: typeof Text | typeof TextInput) => {
    const Comp = C as unknown as { defaultProps?: Record<string, unknown> };
    const existing = Comp.defaultProps ?? {};
    const prevStyle = (existing as { style?: unknown }).style;
    Comp.defaultProps = {
      ...existing,
      style: prevStyle
        ? [{ fontFamily: 'Manrope_400Regular' }, prevStyle]
        : { fontFamily: 'Manrope_400Regular' },
    };
  };
  try {
    apply(Text);
    apply(TextInput);
  } catch {
    // If defaultProps isn't writable, the app renders in the system font.
  }
}

export function useAppFonts() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (loaded) {
    applyBaseFont();
  }
  return {
    fontsLoaded: loaded || !!error || Platform.OS === 'web',
    fontsError: error,
  };
}
