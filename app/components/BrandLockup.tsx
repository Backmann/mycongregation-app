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
 * The mark itself. On a dark bar it is a white badge with the letter in brand
 * colour: a white glyph laid straight on teal has no edge of its own and reads
 * as nothing at all. Inverting it echoes the app icon — same rounded square,
 * same proportions, colours swapped — and gives the logo a shape that stands
 * apart from the bar it sits on.
 *
 * This lives in one place because it is needed twice: the mark alone in
 * section headers, and the mark beside the wordmark on Home. It was written
 * only for the first, so Home kept the old teal-on-teal tile and the badge
 * appeared to do nothing there.
 */
function Mark({
  size,
  radius,
  tone,
}: {
  size: number;
  radius: number;
  tone: Tone;
}) {
  if (tone !== 'dark') {
    return (
      <Image
        source={require('../assets/images/icon.png')}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const inner = Math.round(size * 0.62);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={require('../assets/images/brand-mark-teal.png')}
        style={{ width: Math.round(inner * 0.86), height: inner }}
        resizeMode="contain"
      />
    </View>
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
  const radius = Math.round(mark * 0.28);
  const stacked = layout === 'stacked';
  const myColor = tone === 'dark' ? '#ffffff' : '#0e7490';
  const restColor = tone === 'dark' ? '#ffffff' : '#0f172a';
  const orgColor = tone === 'dark' ? '#bae6fd' : '#0e7490';
  if (markOnly) {
    return (
      <View accessibilityLabel="MyCongregation.org">
        <Mark size={mark} radius={radius} tone={tone} />
      </View>
    );
  }
  return (
    <View
      style={stacked ? styles.stacked : styles.row}
      accessibilityRole="header"
      accessibilityLabel="MyCongregation.org"
    >
      <Mark size={mark} radius={radius} tone={tone} />
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
