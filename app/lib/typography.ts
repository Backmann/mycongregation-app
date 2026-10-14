/**
 * Manrope, one file per weight.
 *
 * React Native does not derive a bold from a regular the way a browser does:
 * a `fontWeight` without the matching `fontFamily` falls back to the system
 * face — and so does a `fontWeight` BESIDE the face, on Android (14 October
 * 2026). The face is the weight: name the file, never a weight with it.
 * scripts/check-fonts.mjs keeps it so.
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
