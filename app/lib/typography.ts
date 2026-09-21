/**
 * Manrope, one file per weight.
 *
 * React Native does not derive a bold from a regular the way a browser does:
 * a `fontWeight` without the matching `fontFamily` falls back to the system
 * face, or to a smeared fake bold. The rest of the app names the file for
 * every weight explicitly — 782 times — and a screen that forgets it looks
 * subtly foreign next to the others. Name it through here.
 *
 * There is no italic: only upright files are loaded, so nothing should ask
 * for `fontStyle: 'italic'`.
 */
export const FONT = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;
