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
 *  - Everywhere a style sets a fontWeight, a matching `fontFamily`
 *    ('Manrope_600SemiBold', 'Manrope_700Bold', …) is added by the codemod, so
 *    bold text renders in the real bold face on every platform, including the
 *    native Google Play build.
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
