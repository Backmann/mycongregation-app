import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONT } from '../lib/typography';

export interface Segment<K extends string> {
  key: K;
  label: string;
  /** A small colour mark before the label — the section's own colour. */
  dot?: string;
}

/**
 * Several positions, one chosen. The app had on/off switches (FilterToggle)
 * but nothing that picks one of three, so this is new — and general, so the
 * next screen that needs it takes this one instead of drawing its own.
 *
 * Every position is at least 44 points tall, whatever the label.
 *
 * Every label WHOLE (10 November 2026): positions take the width their words
 * need rather than equal thirds, and a narrow track — the meeting's tabs on a
 * 1024-wide screen, «Обязанности» cut to «Обязаннос…» — sets them a size
 * smaller. Found by walking the live site at 1024.
 */
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
  tone,
}: {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  /**
   * The chosen position filled in this colour, its label white — a meeting's
   * own tabs in the meeting's colour (the programme redesign, 9 November
   * 2026). Without it, the chosen position is white.
   */
  tone?: string;
}) {
  const [width, setWidth] = useState(0);
  const tight = width > 0 && width < segments.length * 104;
  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segments.map((s) => {
        const on = s.key === value;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            style={[
              styles.segment,
              tight && styles.segmentTight,
              on && (tone ? { backgroundColor: tone } : styles.segmentOn),
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            {s.dot ? <View style={[styles.dot, { backgroundColor: s.dot }]} /> : null}
            <Text
              style={[styles.label, tight && styles.labelTight, on && (tone ? styles.labelTone : styles.labelOn)]}
              numberOfLines={1}
            >
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: '#e9eef4', borderRadius: 12, padding: 3 },
  segment: {
    // By the words: the longest label gets the room it needs.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 9,
    paddingHorizontal: 6,
  },
  // The shadow is written as the rest of the app writes it (CollapsibleMeetingBlock,
  // DateField): a hex colour the hard-coded-text check knows is not prose.
  segmentOn: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentTight: { paddingHorizontal: 4, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 14, fontFamily: FONT.bold, color: '#64748b' },
  labelTight: { fontSize: 13 },
  labelOn: { color: '#0f172a' },
  labelTone: { color: '#ffffff' },
});
