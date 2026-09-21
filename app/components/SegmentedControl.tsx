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
 */
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((s) => {
        const on = s.key === value;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            style={[styles.segment, on && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            {s.dot ? <View style={[styles.dot, { backgroundColor: s.dot }]} /> : null}
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
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
    flex: 1,
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
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 14, fontFamily: FONT.bold, color: '#64748b' },
  labelOn: { color: '#0f172a' },
});
