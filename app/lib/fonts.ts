import React from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
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
 * Cyrillic + Latin-ext coverage, so RU / DE / EN all render correctly. We load
 * the weights we use and, instead of editing hundreds of components, wrap the
 * Text/TextInput render so every run of text is drawn in the Manrope face that
 * matches its resolved fontWeight. Because React Native won't synthesize a
 * weight when an explicit fontFamily is set, mapping weight -> face by hand is
 * the reliable way to keep bold headings actually bold.
 */
const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': 'Manrope_400Regular',
  '200': 'Manrope_400Regular',
  '300': 'Manrope_400Regular',
  normal: 'Manrope_400Regular',
  '400': 'Manrope_400Regular',
  '500': 'Manrope_500Medium',
  '600': 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  '700': 'Manrope_700Bold',
  '800': 'Manrope_800ExtraBold',
  '900': 'Manrope_800ExtraBold',
};

function familyForWeight(weight?: string | number | null): string {
  if (weight == null) return 'Manrope_400Regular';
  return WEIGHT_TO_FAMILY[String(weight)] ?? 'Manrope_400Regular';
}

let patched = false;

function patchComponent(Component: typeof Text | typeof TextInput) {
  const C = Component as unknown as {
    render?: (...args: unknown[]) => React.ReactElement | null;
  };
  const original = C.render;
  if (typeof original !== 'function') return;

  C.render = function (...args: unknown[]) {
    const element = original.apply(this, args) as React.ReactElement | null;
    if (!element) return element;
    const flat =
      (StyleSheet.flatten(
        (element.props as { style?: unknown }).style,
      ) as { fontWeight?: string | number; fontFamily?: string }) ?? {};
    if (flat.fontFamily && !flat.fontFamily.startsWith('Manrope')) {
      return element;
    }
    const family = familyForWeight(flat.fontWeight);
    return React.cloneElement(element, {
      style: [
        { fontFamily: family },
        (element.props as { style?: unknown }).style,
      ],
    } as Partial<typeof element.props>);
  };
}

function applyGlobalManrope() {
  if (patched) return;
  patched = true;
  patchComponent(Text);
  patchComponent(TextInput);
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
    applyGlobalManrope();
  }
  return {
    fontsLoaded: loaded || !!error || Platform.OS === 'web',
    fontsError: error,
  };
}

export { familyForWeight };
