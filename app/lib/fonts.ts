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
 * Application strategy (RN 0.81-safe): we do NOT wrap Text.render — on this RN
 * version the forwardRef Text can't be render-wrapped without blanking heavy
 * screens. Instead we set a base fontFamily on the shared defaultProps, which
 * every <Text>/<TextInput> without its own family inherits. Components that
 * declare an explicit fontWeight keep it; the weight is realized against the
 * loaded Manrope faces (all five weights are registered below, and the native
 * font matcher / web @font-face resolves the right face per weight).
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
    // If defaultProps isn't writable, fall back to the system font silently.
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
