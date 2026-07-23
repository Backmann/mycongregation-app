import { Image, StyleSheet, Text, View } from 'react-native';

type Tone = 'light' | 'dark';
type Layout = 'row' | 'stacked';

type Props = {
  /** size of the square icon tile, in px */
  mark?: number;
  /** wordmark font size, in px (defaults to ~0.6 * mark) */
  word?: number;
  /** 'row' = mark left of text, 'stacked' = mark above text */
  layout?: Layout;
  /** 'light' for light backgrounds, 'dark' for dark/teal backgrounds */
  tone?: Tone;
  /** When true, render only the icon mark (no wordmark) — for section headers. */
  markOnly?: boolean;
};

/**
 * MyCongregation brand lockup: the rounded "C" mark plus the two-tone
 * wordmark, rendered in the app font (not an image) so it stays crisp.
 */
/**
 * The mark itself: the app icon, the same one on the home screen and the
 * store tile, at every size and on every background.
 *
 * It used to be a white badge with the letter inside on dark bars, because an
 * older, flatter icon had no edge of its own against teal. The current icon
 * carries a lighter gradient and a white letter, so it holds up directly on
 * the bar, and using the real icon means there is exactly ONE brand mark in
 * the product rather than a header variant that drifts whenever the icon is
 * redrawn — which is precisely what had happened.
 *
 * The source is 1024px, so it stays sharp at 2x and 3x device densities; no
 * extra corner radius is applied because the icon's own corners are already
 * rounded and transparent, and rounding twice bites into the artwork.
 */
function Mark({ size }: { size: number }) {
  return (
    <Image
      source={require('../assets/images/icon.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

export default function BrandLockup({
  mark = 36,
  word,
  layout = 'row',
  tone = 'light',
  markOnly = false,
}: Props) {
  const wordSize = word ?? Math.round(mark * 0.6);
  const stacked = layout === 'stacked';
  const myColor = tone === 'dark' ? '#ffffff' : '#0e7490';
  const restColor = tone === 'dark' ? '#ffffff' : '#0f172a';
  const orgColor = tone === 'dark' ? '#bae6fd' : '#0e7490';
  if (markOnly) {
    return (
      <View accessibilityLabel="MyCongregation.org">
        <Mark size={mark} />
      </View>
    );
  }
  return (
    <View
      style={stacked ? styles.stacked : styles.row}
      accessibilityRole="header"
      accessibilityLabel="MyCongregation.org"
    >
      <Mark size={mark} />
      <Text
        style={[
          { fontSize: wordSize, fontWeight: '700', fontFamily: 'Manrope_700Bold', letterSpacing: -0.5 },
          stacked
            ? { marginTop: Math.round(mark * 0.18) }
            : { marginLeft: Math.round(mark * 0.3) },
        ]}
      >
        <Text style={{ color: myColor }}>My</Text>
        <Text style={{ color: restColor }}>Congregation</Text>
        <Text style={{ color: orgColor }}>.org</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stacked: { alignItems: 'center' },
});
