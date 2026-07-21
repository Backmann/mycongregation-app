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
export default function BrandLockup({
  mark = 36,
  word,
  layout = 'row',
  tone = 'light',
  markOnly = false,
}: Props) {
  const wordSize = word ?? Math.round(mark * 0.6);
  const radius = Math.round(mark * 0.28);
  const stacked = layout === 'stacked';
  const myColor = tone === 'dark' ? '#ffffff' : '#0e7490';
  const restColor = tone === 'dark' ? '#ffffff' : '#0f172a';
  const orgColor = tone === 'dark' ? '#bae6fd' : '#0e7490';
  if (markOnly) {
    // On the teal header the tile is the same colour as the bar, so the mark
    // used to dissolve into it and leave a small floating letter. On a dark
    // background the glyph alone is the mark — no tile competing with the
    // title beside it. Its aspect is taller than wide, so it is fitted rather
    // than squeezed into a square.
    if (tone === 'dark') {
      return (
        <Image
          source={require('../assets/images/brand-mark-light.png')}
          style={{ width: Math.round(mark * 0.86), height: mark }}
          resizeMode="contain"
          accessibilityLabel="MyCongregation.org"
        />
      );
    }
    return (
      <Image
        source={require('../assets/images/icon.png')}
        style={{ width: mark, height: mark, borderRadius: radius }}
        accessibilityLabel="MyCongregation.org"
      />
    );
  }
  return (
    <View
      style={stacked ? styles.stacked : styles.row}
      accessibilityRole="header"
      accessibilityLabel="MyCongregation.org"
    >
      <Image
        source={require('../assets/images/icon.png')}
        style={{ width: mark, height: mark, borderRadius: radius }}
      />
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
